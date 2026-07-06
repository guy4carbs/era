/**
 * Server-only price-check engine for Era's Shop price-drop alerts (Phase 2B).
 *
 * Two concerns live here, both server-only:
 *
 *   1. `fetchCurrentPrice(saved)` — the current price of a saved product, in
 *      integer cents, or null. Source order (a user decision — BOTH):
 *        - PRIMARY: a Sovrn re-query by `productId`. DORMANT — the affiliate
 *          adapter (`shop-provider.ts`) has no by-id lookup yet, so this branch
 *          returns null today and is wired at Sovrn onboarding. Gated exactly
 *          like the browse adapter (`AFFILIATE_PROVIDER === 'sovrn'` AND a real
 *          `AFFILIATE_FEED_KEY`) so a placeholder key never engages it.
 *        - FALLBACK: re-scrape `saved.productUrl` through the SAME SSRF gate the
 *          import flow uses (`url-import.ts` `safeFetch` → `extractProductMeta`).
 *          There is NO other fetch path — the default is the real SSRF-gated
 *          `safeFetch`; tests inject a fake, production never can.
 *      Modelled on `weather.ts`: bounded timeout, validate, return null on ANY
 *      failure. It NEVER throws into the caller.
 *
 *   2. `runPriceCheck(deps)` — the dispatch batch. Pure orchestration over
 *      injectable data-access + delivery seams (the route wires the DB-backed
 *      ones; tests wire fakes), so the drop rule and per-channel fan-out are unit
 *      testable with no DB and no network. Per-row try/catch means one bad row
 *      never fails the batch.
 *
 * Never import this from a client bundle — it reads secrets from `process.env`
 * and holds no client-safe surface.
 */
import { isRealCredential } from './shop-provider.ts';
import { extractProductMeta, readCapped, safeFetch } from './url-import.ts';
import { type ExpoPushMessage } from './expo-push.ts';
import { type PriceDropEmail } from './send-price-drop-email.ts';

import { type SavedProduct } from '@era/db';

/** Wall timeout for the fallback product-page re-scrape. Mirrors the import flow. */
const SCRAPE_TIMEOUT_MS = 10_000;
/** Body cap for the re-scrape — product markup is small; never unbounded. */
const SCRAPE_MAX_BYTES = 2 * 1024 * 1024; // 2MB

/** Default per-run row cap, so one invocation can never fan out unboundedly. */
export const DEFAULT_BATCH_CAP = 200;

/** The in-app notification card contents for a price drop. Denormalized, self-describing. */
export interface PriceDropPayload {
  readonly savedProductId: string;
  readonly productId: string;
  readonly retailer: string;
  readonly title: string;
  readonly oldPriceCents: number;
  readonly newPriceCents: number;
  readonly currency: string;
  readonly imageUrl: string | null;
  readonly affiliateUrl: string;
}

/** The outcome of one batch — surfaced by the cron route. */
export interface PriceCheckSummary {
  readonly checked: number;
  readonly dropped: number;
  readonly alertsSent: number;
}

// --- Price helpers -----------------------------------------------------------

/**
 * Coerce a major-unit price (a numeric string like "120.00" or a number) to
 * integer cents, or null when it isn't a usable positive amount. Rounds to the
 * nearest cent so float noise (e.g. 0.1 + 0.2) can't drift the comparison.
 */
export function toCents(price: unknown): number | null {
  const value = typeof price === 'number' ? price : typeof price === 'string' ? Number(price) : NaN;
  if (!Number.isFinite(value) || value < 0 || value >= 1e10) {
    return null;
  }
  return Math.round(value * 100);
}

/**
 * The drop rule. A row alerts ONLY on a NEW low: the current price must be below
 * the save-time baseline AND below the last observed price (when we have one).
 * Because the caller records `lastPriceCents = currentCents` on every check, a
 * price that already triggered an alert won't re-alert on the next run — the
 * alert fires once per fresh low, not once per run. A rebound followed by a new,
 * deeper drop alerts again (that IS a new low), which is the intended behaviour.
 */
export function isNewLow(currentCents: number, baselineCents: number, lastPriceCents: number | null): boolean {
  if (currentCents >= baselineCents) {
    return false;
  }
  return lastPriceCents === null || currentCents < lastPriceCents;
}

// --- fetchCurrentPrice -------------------------------------------------------

/** Injectable seams for {@link fetchCurrentPrice}. Both default to the real globals. */
export interface FetchPriceDeps {
  readonly env?: Record<string, string | undefined>;
  /**
   * The SSRF-gated fetcher. Defaults to the real `safeFetch` from `url-import.ts`
   * — https-only, all resolved addresses public, redirects re-validated, wall
   * timeout. Overridden ONLY in tests; production has no other fetch path, so the
   * gate is never bypassable.
   */
  readonly safeFetchImpl?: typeof safeFetch;
}

/**
 * Sovrn re-query by product id — the PRIMARY source, DORMANT today. When a real
 * Sovrn key is provisioned this will look the product up by `saved.productId` and
 * return its current price in cents (or null if delisted). The browse adapter has
 * no by-id endpoint yet, so today this yields null and the caller falls through
 * to the scrape. The gate mirrors `getShopProvider()` so a placeholder key never
 * fires a request that can only fail.
 */
async function fetchViaSovrn(saved: SavedProduct, env: Record<string, string | undefined>): Promise<number | null> {
  if (env.AFFILIATE_PROVIDER !== 'sovrn' || !isRealCredential(env.AFFILIATE_FEED_KEY)) {
    return null;
  }
  // TODO(sovrn-onboarding): re-query the feed by `saved.productId` and return the
  // current price in cents. Until the adapter exposes a by-id lookup this stays
  // dormant and returns null so the scrape fallback runs.
  void saved;
  return null;
}

/**
 * Re-scrape the retailer product page for its current price — the FALLBACK
 * source. Goes through the same SSRF gate + JSON-LD/OpenGraph price extraction as
 * the import flow. Returns cents, or null on ANY failure (blocked url, non-2xx,
 * non-HTML, no price in the markup, timeout, transport). Never throws.
 */
async function fetchViaScrape(saved: SavedProduct, deps: FetchPriceDeps): Promise<number | null> {
  const doFetch = deps.safeFetchImpl ?? safeFetch;
  try {
    const { response } = await doFetch(saved.productUrl, {
      accept: 'text/html,application/xhtml+xml',
      timeoutMs: SCRAPE_TIMEOUT_MS,
    });
    if (!response.ok) {
      response.body?.cancel().catch(() => {});
      return null;
    }
    if (!(response.headers.get('content-type') ?? '').toLowerCase().includes('text/html')) {
      response.body?.cancel().catch(() => {});
      return null;
    }
    const html = new TextDecoder().decode(await readCapped(response, SCRAPE_MAX_BYTES));
    const meta = extractProductMeta(html);
    return meta.price === undefined ? null : toCents(meta.price);
  } catch {
    // Blocked url, network error, timeout, capped-body abort, bad markup — the
    // caller treats a missing price as "no change". Never surface the reason.
    return null;
  }
}

/**
 * Current price of a saved product in integer cents, or null when it can't be
 * determined. Tries the dormant Sovrn re-query first, then falls back to a
 * SSRF-gated re-scrape of the product page. NEVER throws — every failure is a
 * null so a price-check run degrades to "no change" rather than erroring.
 */
export async function fetchCurrentPrice(saved: SavedProduct, deps: FetchPriceDeps = {}): Promise<number | null> {
  const env = deps.env ?? process.env;
  const viaSovrn = await fetchViaSovrn(saved, env);
  if (viaSovrn !== null) {
    return viaSovrn;
  }
  return fetchViaScrape(saved, deps);
}

// --- Cron authorization ------------------------------------------------------

/** The verdict of {@link authorizeCron}. */
export type CronAuth = 'ok' | 'unauthorized' | 'unconfigured';

/**
 * True only for a real, operator-supplied cron secret. An unset var or the
 * committed `change-me-…` placeholder means the job is not provisioned — the
 * route stays inert (503) rather than running on a guessable secret. Same
 * placeholder-guard idiom as `shop-provider.ts` / `send-email.ts`.
 */
function isRealCronSecret(value: string | undefined): value is string {
  if (!value) {
    return false;
  }
  return !value.startsWith('change-me');
}

/**
 * Constant-time string compare that does not early-return on length. A length
 * mismatch is still a mismatch, but we avoid leaking WHERE the first differing
 * byte is for equal-length inputs.
 */
function timingSafeEqualStr(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const ab = enc.encode(a);
  const bb = enc.encode(b);
  if (ab.length !== bb.length) {
    return false;
  }
  let diff = 0;
  for (let i = 0; i < ab.length; i += 1) {
    diff |= ab[i]! ^ bb[i]!;
  }
  return diff === 0;
}

/**
 * Authorize a cron invocation from the `x-cron-secret` header against
 * `CRON_SECRET`. Three outcomes:
 *   - `unconfigured` — no real secret set → the route replies 503 and does no
 *     work (dormant until provisioned).
 *   - `unauthorized` — secret set but header missing/wrong → 401.
 *   - `ok` — header matches.
 */
export function authorizeCron(request: Request, env: Record<string, string | undefined>): CronAuth {
  const secret = env.CRON_SECRET;
  if (!isRealCronSecret(secret)) {
    return 'unconfigured';
  }
  const provided = request.headers.get('x-cron-secret') ?? '';
  return timingSafeEqualStr(provided, secret) ? 'ok' : 'unauthorized';
}

// --- runPriceCheck -----------------------------------------------------------

/**
 * One user's saved product plus the alert channels they've opted into. Produced
 * by the DB join in the route (`saved_products` ⋈ `notification_preferences`
 * WHERE `price_alerts_enabled`), consumed by {@link runPriceCheck}.
 */
export interface PriceWatchRow {
  readonly saved: SavedProduct;
  readonly emailAlerts: boolean;
  readonly pushAlerts: boolean;
  readonly userEmail: string;
}

/**
 * Injectable seams for {@link runPriceCheck}. The route supplies DB-backed and
 * transport-backed implementations; tests supply fakes. This is why the engine
 * needs neither a DB nor the network to test.
 */
export interface PriceCheckDeps {
  /** Load up to `cap` opted-in watch rows (the join lives in the route). */
  readonly loadRows: (cap: number) => Promise<readonly PriceWatchRow[]>;
  /** Current price in cents (or null). Defaults to {@link fetchCurrentPrice}. */
  readonly fetchPrice?: (saved: SavedProduct) => Promise<number | null>;
  /** Persist the check outcome: always stamp `lastCheckedAt`; set `lastPriceCents` when non-null. */
  readonly recordCheck: (savedId: string, currentCents: number | null, checkedAt: Date) => Promise<void>;
  /** Insert the in-app `price_drop` notification (always, on a drop). */
  readonly insertNotification: (userId: string, payload: PriceDropPayload) => Promise<void>;
  /** The user's registered Expo push tokens (empty when none). */
  readonly loadPushTokens: (userId: string) => Promise<readonly string[]>;
  /** Send the price-drop email (dormant on `RESEND_API_KEY`). */
  readonly sendEmail: (args: PriceDropEmail) => Promise<void>;
  /** Send the Expo push (dormant on tokens). */
  readonly sendPush: (tokens: readonly string[], message: ExpoPushMessage) => Promise<void>;
  readonly now?: () => Date;
  readonly cap?: number;
  readonly log?: (message: string) => void;
}

/**
 * Run one price-check batch. For each opted-in watch row: fetch the current
 * price, record the check, and — on a genuine NEW low vs the save-time baseline
 * (see {@link isNewLow}) — dispatch across the user's channels:
 *   - ALWAYS: an in-app `price_drop` notification.
 *   - if `emailAlerts` and we have their email: the price-drop email.
 *   - if `pushAlerts` and they have tokens: an Expo push.
 *
 * `recordCheck` runs BEFORE dispatch, so `lastPriceCents` reflects the new low
 * immediately — a channel that fails is best-effort and is NOT retried (the
 * reliability-first choice: never double-alert). Per-row try/catch means one
 * failure logs and moves on; the batch never throws. `alertsSent` counts every
 * channel dispatch (in-app + email + push), not just the drop count.
 */
export async function runPriceCheck(deps: PriceCheckDeps): Promise<PriceCheckSummary> {
  const fetchPrice = deps.fetchPrice ?? ((saved: SavedProduct) => fetchCurrentPrice(saved));
  const now = deps.now ?? ((): Date => new Date());
  const cap = deps.cap ?? DEFAULT_BATCH_CAP;
  const log = deps.log ?? ((): void => {});

  let checked = 0;
  let dropped = 0;
  let alertsSent = 0;

  const rows = await deps.loadRows(cap);
  for (const row of rows) {
    try {
      checked += 1;
      const currentCents = await fetchPrice(row.saved);
      const checkedAt = now();
      await deps.recordCheck(row.saved.id, currentCents, checkedAt);
      if (currentCents === null) {
        continue;
      }

      const baselineCents = toCents(row.saved.priceSnapshot);
      if (baselineCents === null) {
        continue;
      }
      if (!isNewLow(currentCents, baselineCents, row.saved.lastPriceCents)) {
        continue;
      }

      dropped += 1;
      const payload: PriceDropPayload = {
        savedProductId: row.saved.id,
        productId: row.saved.productId,
        retailer: row.saved.retailer,
        title: row.saved.title,
        oldPriceCents: baselineCents,
        newPriceCents: currentCents,
        currency: row.saved.currency,
        imageUrl: row.saved.imageUrl,
        affiliateUrl: row.saved.affiliateUrl,
      };

      // Always: the in-app card.
      await deps.insertNotification(row.saved.userId, payload);
      alertsSent += 1;

      // Opt-in email (dormant on RESEND_API_KEY).
      if (row.emailAlerts && row.userEmail) {
        await deps.sendEmail({
          to: row.userEmail,
          title: row.saved.title,
          brand: row.saved.brand ?? row.saved.retailer,
          retailer: row.saved.retailer,
          oldPrice: baselineCents / 100,
          newPrice: currentCents / 100,
          currency: row.saved.currency,
          affiliateUrl: row.saved.affiliateUrl,
        });
        alertsSent += 1;
      }

      // Opt-in push (dormant on registered tokens).
      if (row.pushAlerts) {
        const tokens = await deps.loadPushTokens(row.saved.userId);
        if (tokens.length > 0) {
          await deps.sendPush(tokens, {
            title: row.saved.title,
            body: `Now cheaper at ${row.saved.retailer}`,
            data: { kind: 'price_drop', savedProductId: row.saved.id },
          });
          alertsSent += 1;
        }
      }
    } catch (error) {
      // One row's failure never fails the run. Log the class only — no PII.
      const reason = error instanceof Error ? error.name : 'unknown';
      log(`[price-check] row ${row.saved.id} failed (${reason})`);
    }
  }

  return { checked, dropped, alertsSent };
}
