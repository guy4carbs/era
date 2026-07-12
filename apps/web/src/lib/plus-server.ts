/**
 * Server-only read of the caller's Era+ entitlement, for the web `/plus` server
 * component and any route that must branch on Plus.
 *
 * Era+ is DORMANT behind a feature flag: when `isPlusEnabledServer()` is false,
 * nobody is Plus and this resolves `{ isPlus: false }` without touching the DB.
 * When enabled, it reads the `subscriptions` cache — a 1:1-with-user table
 * written by the RevenueCat webhook (+ `stripeCustomerId` at Stripe checkout) —
 * and applies the entitlement predicate: a row exists AND (`expiresAt` is null,
 * i.e. lifetime/promotional, OR `expiresAt` is still in the future).
 *
 * `manageUrl` is intentionally null here: the Stripe billing-portal URL is minted
 * on demand by POST /api/plus/portal (a Stripe API call), never on every render.
 * The `/plus` component shows a "Manage plan" button that hits that route on click.
 *
 * Never fails a render: any DB error degrades to "not Plus" and is logged.
 * Never import from a client bundle (reads the DB + server env).
 *
 * Entitlement + flag logic delegate to @era/core (`isPlus`, `isEraPlusEnabled`)
 * so web, mobile, and the RevenueCat webhook agree on one definition; this file
 * owns only the session→userId resolution and the DB read.
 */
import { eq } from 'drizzle-orm';

import { isEraPlusEnabled, isPlus } from '@era/core';
import { strings } from '@era/core/strings';
import { createDbClient, subscriptions, type DbClient, type Subscription } from '@era/db';

import { auth } from './auth.ts';
import {
  fetchPlusDisplayPrices,
  getStripe,
  isStripeConfigured,
  stripePriceForPlan,
  type PlusDisplayPrices,
} from './plus-stripe.ts';

const db = createDbClient(process.env.DATABASE_URL!);

/**
 * Server-side Era+ feature flag — delegates to @era/core's canonical
 * `isEraPlusEnabled`, reading `ERA_PLUS_ENABLED`. This is the SERVER half of the
 * flag (the client half — `isPlusEnabledClient`, reading
 * `NEXT_PUBLIC_ERA_PLUS_ENABLED` — lives in Nova's `plus-flags.ts`). Read as a
 * raw env var, not through the zod schema, so a dormant feature never blocks
 * boot. The Era+ server surfaces (this reader, the `/api/plus/*` routes) gate on it.
 */
export function isPlusEnabledServer(): boolean {
  return isEraPlusEnabled(process.env.ERA_PLUS_ENABLED);
}

/**
 * Whether SANDBOX-environment subscriptions count as entitled (Sentinel N1: a
 * free TestFlight/Stripe-test purchase must never grant production Plus).
 * 'true' only, mirroring the flag idiom — on for the sandbox-E2E window, off
 * before launch, never again after.
 */
function allowSandboxEntitlements(): boolean {
  return process.env.ERA_PLUS_ALLOW_SANDBOX === 'true';
}

/** The caller's Era+ status as the UI needs it. `manageUrl` is populated on demand elsewhere. */
export interface PlusState {
  readonly isPlus: boolean;
  readonly manageUrl?: string | null;
}

const NOT_PLUS: PlusState = { isPlus: false, manageUrl: null };

/**
 * Resolve the caller (from the request headers) into their Era+ entitlement.
 * Called as `getPlusState({ headers: await headers() })` from a server component.
 * Returns `{ isPlus: false }` when the feature is dormant, there is no session,
 * or the entitlement is absent/expired.
 */
export async function getPlusState(opts: { headers: Headers }): Promise<PlusState> {
  // Dormant kill-switch: the feature flag gates the whole read.
  if (!isPlusEnabledServer()) {
    return NOT_PLUS;
  }

  const session = await auth.api.getSession({ headers: opts.headers });
  const userId = session?.user.id;
  if (!userId) {
    return NOT_PLUS;
  }

  try {
    const [row] = await db
      .select({
        expiresAt: subscriptions.expiresAt,
        environment: subscriptions.environment,
      })
      .from(subscriptions)
      .where(eq(subscriptions.userId, userId))
      .limit(1);

    // The row (or its absence) IS a PlusSubscriptionState; core's isPlus applies
    // the canonical predicate (no row / expired / non-allowed sandbox → false).
    return {
      isPlus: isPlus(row, new Date(), {
        allowSandboxEntitlements: allowSandboxEntitlements(),
      }),
      manageUrl: null,
    };
  } catch (error) {
    // A Plus read must never crash a page render — default to not-Plus.
    console.error('[era-plus] getPlusState read failed; defaulting to not-Plus:', error);
    return NOT_PLUS;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// THE SERVER-SIDE ENTITLEMENT GATE.
//
// `getUserPlusState` is the primitive that EVERY future gated feature calls when
// it already holds a db client + userId — GATING IS SERVER-SIDE ONLY.
// `NEXT_PUBLIC_ERA_PLUS_ENABLED` / `EXPO_PUBLIC_ERA_PLUS_ENABLED` are COSMETIC:
// they choose which UI to render, NEVER what the user may access. A client that
// forges its flag or its own `isPlus` gets nothing — the server never trusts
// client state, only the `subscriptions` cache read here. Consumers gate on
// `state.isPlus`, not on `state.subscription !== null`.
//
// `getPlusState({ headers })` above is the request-level convenience for server
// components; this is the reusable db-level primitive it (and the `/api/plus/*`
// routes) build on. The Stripe configuration/price helpers live in
// `plus-stripe.ts` (the one module that imports the Stripe SDK).
// ─────────────────────────────────────────────────────────────────────────────

/** The db-level entitlement verdict for a user. Gate on {@link UserPlusState.isPlus}. */
export interface UserPlusState {
  readonly isPlus: boolean;
  readonly subscription: Subscription | null;
}

/**
 * THE server-side Era+ gate. Loads the user's cached subscription row and
 * reports whether it grants Plus right now (via core's pure `isPlus`). A missing
 * row → not Plus. This is the ONLY thing a gated feature should trust — never a
 * client-sent flag. Returns the full row too, for callers that need its detail
 * (e.g. the billing portal's `stripeCustomerId` / `store`).
 */
export async function getUserPlusState(client: DbClient, userId: string, now: Date = new Date()): Promise<UserPlusState> {
  const [row] = await client.select().from(subscriptions).where(eq(subscriptions.userId, userId)).limit(1);
  const subscription = row ?? null;
  return {
    isPlus: isPlus(subscription, now, { allowSandboxEntitlements: allowSandboxEntitlements() }),
    subscription,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Display prices — the paywall's only source of money figures.
// ─────────────────────────────────────────────────────────────────────────────

/** One Stripe read serves renders for an hour; prices change ~never. */
const PRICES_TTL_MS = 60 * 60 * 1000;

let pricesCache: { value: PlusDisplayPrices | null; expiresAt: number } | null = null;

/**
 * Cached, dormancy-aware read of the two plans' Stripe display prices, shared by
 * the `/plus` server component and GET /api/plus/prices so there is exactly one
 * cache and one Stripe read path.
 *
 * Null means "render price-free": the feature is dormant, Stripe is not (fully)
 * provisioned, the prices are unrenderable (metered / interval mismatch / mixed
 * currency — see `fetchPlusDisplayPrices`), or the fetch failed. Unrenderable
 * prices ARE cached for the TTL (they're data, an operator must fix them);
 * fetch FAILURES are not cached, so the next render retries.
 */
export async function getPlusDisplayPrices(): Promise<PlusDisplayPrices | null> {
  if (!isPlusEnabledServer() || !isStripeConfigured()) {
    return null;
  }
  if (pricesCache && pricesCache.expiresAt > Date.now()) {
    return pricesCache.value;
  }
  // isStripeConfigured() above guarantees these resolve; the null-checks keep
  // the types honest without a non-null assertion.
  const stripe = getStripe();
  const monthlyPriceId = stripePriceForPlan('monthly');
  const annualPriceId = stripePriceForPlan('annual');
  if (!stripe || !monthlyPriceId || !annualPriceId) {
    return null;
  }
  try {
    const value = await fetchPlusDisplayPrices(stripe, {
      monthlyPriceId,
      annualPriceId,
      savingsPerYear: strings.plus.savingsPerYear,
    });
    pricesCache = { value, expiresAt: Date.now() + PRICES_TTL_MS };
    return value;
  } catch (error) {
    // A price read must never break the paywall — render price-free and retry
    // on the next request. Log without Stripe internals reaching any client.
    console.error('[era-plus] price fetch failed; rendering price-free:', error);
    return null;
  }
}
