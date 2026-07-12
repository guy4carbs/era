/**
 * Stripe wiring for Era+ web checkout and the customer billing portal.
 *
 * DORMANT BY DEFAULT. Every entry point reads its credentials through
 * `isRealCredential`, so the committed `change-me-…` placeholders leave the
 * whole module inert: `getStripe()` and the price lookups return null, and the
 * `/api/plus/*` routes treat that as "the endpoint does not exist" (404). The
 * client is constructed lazily per request — never at module scope — so a build
 * or boot never requires the key.
 *
 * ENTITLEMENT FLOW. Stripe only COLLECTS money here; it never grants access.
 * The Checkout Session stamps `subscription_data.metadata.app_user_id` with our
 * userId — that exact key is what RevenueCat's Stripe integration reads to
 * attribute the subscription to the same RC app user as the iOS purchase path,
 * unifying entitlements across platforms. Access is then granted by the
 * RevenueCat webhook writing the `subscriptions` cache; nothing in this module
 * writes entitlement state.
 *
 * CUSTOMER IDENTITY. We find-or-create ONE Stripe Customer per user, stamped
 * with `metadata.app_user_id`, and look it up via Stripe customer search on
 * that metadata. The id is also persisted onto the user's `subscriptions` row —
 * but only via UPDATE: the row's entitlement columns are NOT NULL and the row
 * itself is created by the RevenueCat webhook, so before the first purchase
 * there is nothing to write onto. The portal route therefore falls back to the
 * metadata search for a Stripe subscriber whose row predates the persisted id.
 * (Stripe search is eventually consistent — ~1 min — which is fine for both
 * call sites: a double-clicked checkout may rarely create a second customer,
 * which is harmless, and the portal is only reachable after a purchase exists.)
 *
 * Everything takes its Stripe surface as a parameter (`StripePlusClient`), the
 * same dependency-injection idiom as `sendEmail` — tests pass fakes, no module
 * mocking.
 */
import Stripe from 'stripe';
import { eq } from 'drizzle-orm';

import { subscriptions, type DbClient } from '@era/db';

import { isRealCredential } from './send-email.ts';
import { siteUrl } from './site-url.ts';

/** The two purchasable Era+ plans. */
export type PlusPlan = 'monthly' | 'annual';

/**
 * The narrow slice of the Stripe SDK this module uses. The real `Stripe`
 * client satisfies it structurally; tests hand in fakes.
 */
export interface StripePlusClient {
  customers: {
    search(params: { query: string; limit?: number }): Promise<{ data: Array<{ id: string }> }>;
    create(params: {
      email?: string;
      metadata: Record<string, string>;
    }): Promise<{ id: string }>;
  };
  checkout: {
    sessions: {
      create(params: {
        mode: 'subscription';
        customer: string;
        line_items: Array<{ price: string; quantity: number }>;
        subscription_data: { metadata: Record<string, string> };
        success_url: string;
        cancel_url: string;
        allow_promotion_codes: boolean;
      }): Promise<{ url: string | null }>;
    };
  };
  billingPortal: {
    sessions: {
      create(params: { customer: string; return_url: string }): Promise<{ url: string }>;
    };
  };
  prices: {
    retrieve(id: string): Promise<{
      unit_amount: number | null;
      currency: string;
      recurring: { interval: 'day' | 'week' | 'month' | 'year' } | null;
    }>;
  };
}

/**
 * Lazily construct the Stripe client, or null while the key is a placeholder.
 * Cheap enough to call per request; deliberately NOT cached at module scope so
 * the dormant→live transition is a Railway env change + redeploy, no code.
 */
export function getStripe(env: NodeJS.ProcessEnv = process.env): StripePlusClient | null {
  const key = env.STRIPE_SECRET_KEY;
  if (!isRealCredential(key)) {
    return null;
  }
  return new Stripe(key);
}

/** The Stripe Price id for a plan, or null while it is a placeholder. */
export function stripePriceForPlan(
  plan: PlusPlan,
  env: NodeJS.ProcessEnv = process.env,
): string | null {
  const price =
    plan === 'monthly' ? env.STRIPE_PRICE_ERA_PLUS_MONTHLY : env.STRIPE_PRICE_ERA_PLUS_ANNUAL;
  return isRealCredential(price) ? price : null;
}

/**
 * True once the ENTIRE Stripe surface is provisioned — the secret key and both
 * plan prices. The routes gate on this so a half-configured environment can
 * never sell one plan and 500 on the other.
 */
export function isStripeConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  return (
    getStripe(env) !== null &&
    stripePriceForPlan('monthly', env) !== null &&
    stripePriceForPlan('annual', env) !== null
  );
}

/**
 * Find the user's Stripe Customer by our `app_user_id` metadata stamp, or
 * create one. The stamp is what makes the customer findable again (portal
 * fallback) and keeps one-customer-per-user across repeated checkouts.
 */
export async function findOrCreateStripeCustomer(
  stripe: StripePlusClient,
  opts: { userId: string; email?: string },
): Promise<string> {
  // userId is a Better Auth id (no quotes to escape), but strip any anyway so a
  // hostile value can never break out of the search-string literal.
  const safeId = opts.userId.replace(/['"\\]/g, '');
  const found = await stripe.customers.search({
    query: `metadata['app_user_id']:'${safeId}'`,
    limit: 1,
  });
  const existing = found.data[0];
  if (existing) {
    return existing.id;
  }
  const created = await stripe.customers.create({
    email: opts.email,
    metadata: { app_user_id: opts.userId },
  });
  return created.id;
}

/**
 * Create the hosted Checkout Session for a plan and return its URL.
 *
 * `subscription_data.metadata.app_user_id` is the RevenueCat unification key —
 * RC's Stripe integration reads it off the resulting Stripe Subscription and
 * files the purchase under the same RC app user as an iOS purchase would be.
 * Without it the web purchase would be entitlement-orphaned. Do not rename.
 */
export async function createPlusCheckoutSession(
  stripe: StripePlusClient,
  opts: { userId: string; customerId: string; priceId: string },
): Promise<string | null> {
  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    customer: opts.customerId,
    line_items: [{ price: opts.priceId, quantity: 1 }],
    subscription_data: { metadata: { app_user_id: opts.userId } },
    // `status` is the exact query param the /plus page's parseStatus reads.
    success_url: `${siteUrl()}/plus?status=success`,
    cancel_url: `${siteUrl()}/plus?status=canceled`,
    // Honest pricing only — promo codes would reintroduce the "discount
    // theater" the brand voice forbids. Revisit deliberately if ever needed.
    allow_promotion_codes: false,
  });
  return session.url;
}

/** Create a billing-portal session and return its URL. */
export async function createPortalSession(
  stripe: StripePlusClient,
  customerId: string,
): Promise<string> {
  const session = await stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: `${siteUrl()}/plus`,
  });
  return session.url;
}

/** A plan's display price, ready to render — no client-side money math. */
export interface PlusDisplayPrice {
  /** Display-formatted amount, e.g. "$6.99". */
  amount: string;
  /** ISO currency code, lowercase as Stripe reports it (e.g. "usd"). */
  currency: string;
  interval: 'month' | 'year';
  /** Display-ready savings line — present ONLY when annual is genuinely cheaper. */
  savings?: string;
}

/** Both plans' display prices, shaped exactly as the /plus paywall consumes them. */
export interface PlusDisplayPrices {
  monthly: PlusDisplayPrice;
  annual: PlusDisplayPrice;
}

/**
 * Fetch both plans' prices from Stripe and shape them for display. Returns null
 * when the configured prices can't be rendered HONESTLY — a missing unit_amount
 * (metered/tiered pricing), a non-recurring price, or intervals that don't match
 * the plan they're configured for (a "monthly" price billed yearly would make
 * every label on the paywall a lie, so we show no prices instead).
 *
 * The savings line is computed, never asserted: twelve months at the monthly
 * price versus one year at the annual price, surfaced only when the difference
 * is real and positive, and worded by `savingsPerYear` (the caller passes the
 * strings.plus template so copy stays out of this module).
 */
export async function fetchPlusDisplayPrices(
  stripe: StripePlusClient,
  opts: {
    monthlyPriceId: string;
    annualPriceId: string;
    savingsPerYear: (amount: string) => string;
  },
): Promise<PlusDisplayPrices | null> {
  const [monthly, annual] = await Promise.all([
    stripe.prices.retrieve(opts.monthlyPriceId),
    stripe.prices.retrieve(opts.annualPriceId),
  ]);
  if (
    monthly.unit_amount === null ||
    annual.unit_amount === null ||
    monthly.recurring?.interval !== 'month' ||
    annual.recurring?.interval !== 'year' ||
    monthly.currency !== annual.currency
  ) {
    return null;
  }

  const format = (cents: number): string =>
    new Intl.NumberFormat('en-US', {
      style: 'currency',
      // Stripe reports lowercase ISO codes; Intl wants the code, any case.
      currency: monthly.currency.toUpperCase(),
    }).format(cents / 100);

  const yearlyAtMonthlyRate = monthly.unit_amount * 12;
  const savedCents = yearlyAtMonthlyRate - annual.unit_amount;

  return {
    monthly: { amount: format(monthly.unit_amount), currency: monthly.currency, interval: 'month' },
    annual: {
      amount: format(annual.unit_amount),
      currency: annual.currency,
      interval: 'year',
      ...(savedCents > 0 ? { savings: opts.savingsPerYear(format(savedCents)) } : {}),
    },
  };
}

/**
 * Best-effort persist of the customer id onto the user's `subscriptions` row.
 * UPDATE-only by design: the row is created by the RevenueCat webhook with
 * NOT NULL entitlement columns, so before the first purchase there is no row —
 * and inventing a half-row here would corrupt the cache's meaning. Callers
 * treat a miss as fine; the portal route's search fallback covers it.
 */
export async function persistStripeCustomerId(
  db: DbClient,
  userId: string,
  customerId: string,
): Promise<void> {
  await db
    .update(subscriptions)
    .set({ stripeCustomerId: customerId })
    .where(eq(subscriptions.userId, userId));
}
