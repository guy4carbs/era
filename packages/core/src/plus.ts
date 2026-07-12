/**
 * @era/core — Era+ subscription domain logic. PURE and CLIENT-SAFE.
 *
 * This module is the single source of truth for two questions: "is the Era+
 * feature turned on?" and "does this cached subscription grant Plus right now?",
 * plus the pure mapper that turns a RevenueCat webhook event into the row values
 * we cache. It has NO server-only dependencies (no db client, no env loader, no
 * aws-sdk), so web and mobile client bundles can import {@link isPlus} and
 * {@link isEraPlusEnabled} through the `@era/core/plus` subpath WITHOUT pulling
 * in the server-tainted barrel. Row types are imported type-only, so they erase
 * at compile time and add no runtime edge.
 *
 * ENTITLEMENT MODEL. RevenueCat is the single source of truth for entitlement on
 * BOTH platforms — iOS in-app purchases report to RC directly, and web Stripe
 * purchases are forwarded into RC by RC's Stripe integration (unified by the
 * `app_user_id` we stamp on the Stripe subscription). Our Neon `subscriptions`
 * table is only a CACHE of RC's state, written by the RC webhook (the one
 * exception being `stripeCustomerId`, written by the web checkout route). So the
 * mapping logic below deliberately mirrors RC's own semantics rather than
 * inventing its own — see {@link applyRevenueCatEvent}.
 *
 * GATING IS SERVER-SIDE. {@link isPlus} is pure and runs anywhere, but the
 * authoritative gate every future paid feature calls is `getPlusState` in
 * `apps/web/src/lib/plus-server.ts` (it reads the cached row). Client flags are
 * cosmetic — they decide what UI to show, never what the user is entitled to.
 */

import type { Subscription } from '@era/db';

/**
 * Master feature flag for the entire Era+ surface. True ONLY for the exact
 * string 'true' — any other value (unset, '1', 'yes', 'TRUE', a typo) reads as
 * off, so a fat-fingered flag can never half-enable a monetization surface. The
 * caller supplies the raw value it wants to gate on: the server reads
 * `env.ERA_PLUS_ENABLED`, the web client `NEXT_PUBLIC_ERA_PLUS_ENABLED`, the
 * mobile client `EXPO_PUBLIC_ERA_PLUS_ENABLED`. Never throws.
 */
export function isEraPlusEnabled(flag: string | undefined): boolean {
  return flag === 'true';
}

/**
 * The minimum a caller needs to decide entitlement: the entitlement's expiry.
 * The full {@link Subscription} row satisfies it, and so does a trimmed shape a
 * client reconstructs from an API response (with `expiresAt` parsed back to a
 * Date), so {@link isPlus} works identically on the server and in a client.
 */
export interface PlusSubscriptionState {
  /** Null = a non-expiring entitlement (promotional / lifetime). */
  readonly expiresAt: Date | null;
  /**
   * The RevenueCat environment the purchase happened in — 'sandbox' |
   * 'production' in practice (see {@link SubscriptionEnvironment}), typed
   * `string` so the raw DB row (a text column) satisfies this shape
   * structurally. Optional so trimmed client shapes stay valid; when it reads
   * 'sandbox' the row is denied by default — see {@link isPlus}.
   */
  readonly environment?: string;
}

/** Options for {@link isPlus}. */
export interface IsPlusOptions {
  /**
   * Sandbox purchases grant Plus ONLY while this is true. A TestFlight /
   * StoreKit-sandbox or Stripe-test purchase is FREE, and RC forwards its
   * events to the same webhook — without this gate a free sandbox purchase
   * would yield a real production entitlement (Sentinel N1). The server flips
   * it from `ERA_PLUS_ALLOW_SANDBOX`, on ONLY for the sandbox-E2E window;
   * never after launch.
   */
  readonly allowSandboxEntitlements?: boolean;
}

/**
 * Whether a cached subscription grants Era+ at `now`. Pure and side-effect free.
 *
 * Active iff a subscription exists AND it has not expired: a null `expiresAt`
 * means a non-expiring grant (promotional/lifetime), and otherwise access holds
 * up to and including the expiry instant it, i.e. `expiresAt > now`.
 *
 * A billing issue does NOT revoke access before expiry. When a renewal fails RC
 * moves the user into a grace/billing-retry period and EXTENDS or ENDS
 * `expiresAt` itself; our cache just follows the `expiresAt` RC reports. So
 * keying purely off `expiresAt` — and treating `billingIssuesDetectedAt` as an
 * informational flag only — is exactly right: we neither cut a paying user off
 * early nor keep an expired one on.
 */
export function isPlus(
  sub: PlusSubscriptionState | null | undefined,
  now: Date = new Date(),
  opts: IsPlusOptions = {},
): boolean {
  if (!sub) return false;
  // A free sandbox purchase must never grant production Plus. Rows without an
  // `environment` (trimmed client shapes) are treated as production.
  if (sub.environment === 'sandbox' && opts.allowSandboxEntitlements !== true) {
    return false;
  }
  return sub.expiresAt === null || sub.expiresAt.getTime() > now.getTime();
}

/** The purchase store, normalized from RevenueCat's `store` field. */
export type SubscriptionStore = 'app_store' | 'stripe' | 'play_store' | 'promotional';

/** The RevenueCat environment, normalized from its upper-cased `environment`. */
export type SubscriptionEnvironment = 'sandbox' | 'production';

/**
 * The RevenueCat webhook event types Era consumes. RC sends more (e.g.
 * NON_RENEWING_PURCHASE, SUBSCRIPTION_PAUSED, TEST); anything outside this set is
 * ignored upstream. Grouped by effect:
 *   - grant/refresh access: INITIAL_PURCHASE, RENEWAL, UNCANCELLATION,
 *     PRODUCT_CHANGE, TRANSFER
 *   - keep access, flag intent: CANCELLATION (auto-renew off), BILLING_ISSUE
 *   - end access: EXPIRATION
 */
export type RevenueCatEventType =
  | 'INITIAL_PURCHASE'
  | 'RENEWAL'
  | 'CANCELLATION'
  | 'UNCANCELLATION'
  | 'EXPIRATION'
  | 'BILLING_ISSUE'
  | 'PRODUCT_CHANGE'
  | 'TRANSFER';

/** The set above as a runtime guard for {@link parseRevenueCatEvent}. */
const CONSUMED_EVENT_TYPES: ReadonlySet<string> = new Set<RevenueCatEventType>([
  'INITIAL_PURCHASE',
  'RENEWAL',
  'CANCELLATION',
  'UNCANCELLATION',
  'EXPIRATION',
  'BILLING_ISSUE',
  'PRODUCT_CHANGE',
  'TRANSFER',
]);

/**
 * The subset of a RevenueCat webhook event Era maps, already NORMALIZED off the
 * wire (RC ships upper-cased stores/environments and millisecond timestamps).
 * Produced by {@link parseRevenueCatEvent}; consumed by {@link applyRevenueCatEvent}.
 */
export interface RevenueCatEvent {
  /** RC's event id — the idempotency key we stamp as `lastEventId`. */
  readonly id: string;
  readonly type: RevenueCatEventType;
  /** RC `app_user_id`. By our contract this equals the Era userId. */
  readonly appUserId: string;
  readonly productId: string;
  readonly store: SubscriptionStore;
  readonly environment: SubscriptionEnvironment;
  readonly purchasedAtMs: number;
  /** Null = non-expiring entitlement. */
  readonly expirationAtMs: number | null;
  /** RC `event_timestamp_ms` — the ordering key; older-or-equal events are stale. */
  readonly eventTimestampMs: number;
}

/** Map RC's upper-cased `store` onto our normalized union, or null if unknown. */
function normalizeStore(raw: unknown): SubscriptionStore | null {
  switch (raw) {
    case 'APP_STORE':
    case 'MAC_APP_STORE':
      return 'app_store';
    case 'PLAY_STORE':
      return 'play_store';
    case 'STRIPE':
    case 'RC_BILLING':
      return 'stripe';
    case 'PROMOTIONAL':
      return 'promotional';
    default:
      return null;
  }
}

/** Map RC's upper-cased `environment` onto our normalized union, or null. */
function normalizeEnvironment(raw: unknown): SubscriptionEnvironment | null {
  if (raw === 'SANDBOX') return 'sandbox';
  if (raw === 'PRODUCTION') return 'production';
  return null;
}

/** Read a finite number field, or null when absent/malformed. */
function numberOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/** Read a non-empty string field, or null. */
function stringOrNull(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

/**
 * Parse and normalize the `event` object from a RevenueCat webhook payload
 * (`body.event`). Returns null when the event is malformed OR of a type we do
 * not consume, so the webhook handler treats both as an accept-and-ignore. Pure;
 * never throws.
 *
 * TRANSFER events carry no `product_id`/`expiration_at_ms` of their own (the
 * entitlement's product is unchanged by the move), so those two fields fall back
 * to null here and {@link applyRevenueCatEvent} preserves the existing values.
 *
 * KNOWN GAP — TRANSFER (Ledger F1, ticketed pre-launch): real RC TRANSFER
 * payloads carry `transferred_from`/`transferred_to` arrays and NO top-level
 * `app_user_id`, so today they fail the app_user_id requirement below and are
 * accept-and-ignored. Effect: the losing account keeps cached Plus until its
 * cached expiry; the gaining account waits for its next RENEWAL. Fix before
 * monetization goes live: special-case TRANSFER to read the two arrays and emit
 * a revoke + a grant, with a realistic-payload test.
 */
export function parseRevenueCatEvent(raw: unknown): RevenueCatEvent | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const e = raw as Record<string, unknown>;

  const type = e.type;
  if (typeof type !== 'string' || !CONSUMED_EVENT_TYPES.has(type)) return null;

  const id = stringOrNull(e.id);
  const appUserId = stringOrNull(e.app_user_id);
  const store = normalizeStore(e.store);
  const environment = normalizeEnvironment(e.environment);
  const eventTimestampMs = numberOrNull(e.event_timestamp_ms);
  const purchasedAtMs = numberOrNull(e.purchased_at_ms);
  if (id === null || appUserId === null || store === null || environment === null || eventTimestampMs === null) {
    return null;
  }

  return {
    id,
    type: type as RevenueCatEventType,
    appUserId,
    productId: stringOrNull(e.product_id) ?? '',
    store,
    environment,
    // A grant with no purchase timestamp is degenerate; fall back to the event
    // time so `purchasedAt` is always a real instant.
    purchasedAtMs: purchasedAtMs ?? eventTimestampMs,
    expirationAtMs: numberOrNull(e.expiration_at_ms),
    eventTimestampMs,
  };
}

/**
 * The subscription-row values a RevenueCat event maps to. This is the cache
 * update the webhook upserts. `userId` doubles as the PK; `stripeCustomerId` is
 * intentionally ABSENT — that column is owned by the web checkout route, never
 * the webhook, so the mapper must never set or clear it.
 */
export type SubscriptionUpsert = Omit<
  Subscription,
  'stripeCustomerId' | 'createdAt' | 'updatedAt'
>;

/**
 * Fold one RevenueCat event onto the cached subscription row (or null when there
 * is no cached row yet), returning the new row values — or null when the event
 * is STALE and must be ignored.
 *
 * Staleness is by RC's own ordering clock: an event whose `eventTimestampMs` is
 * older than OR EQUAL to the cached `lastEventAt` is dropped. `<=` (not `<`) also
 * makes an exact replay of the last-applied event a no-op, so redelivery is
 * idempotent without a second id check.
 *
 * Every branch stamps `lastEventId`/`lastEventAt` and recomputes the mutable
 * fields from the event; the differences are only in the intent flags:
 *   - grants (INITIAL_PURCHASE / RENEWAL / UNCANCELLATION / PRODUCT_CHANGE /
 *     TRANSFER): active, auto-renew on, both intent flags cleared.
 *   - CANCELLATION: auto-renew off + `unsubscribeDetectedAt` stamped, but
 *     `expiresAt` is untouched — access continues until it (RC keeps the date).
 *   - BILLING_ISSUE: `billingIssuesDetectedAt` stamped; access is NOT cut here
 *     (see {@link isPlus}) — RC owns whether/when `expiresAt` moves. The renew
 *     intent and any prior unsubscribe flag are preserved.
 *   - EXPIRATION: auto-renew off; `expiresAt` is now in the past, so
 *     {@link isPlus} reads false.
 *
 * Pure; never throws. TRANSFER/other events lacking product/expiration inherit
 * those from `existing` so a move doesn't blank the cached entitlement.
 */
export function applyRevenueCatEvent(
  existing: Subscription | null,
  event: RevenueCatEvent,
): SubscriptionUpsert | null {
  if (existing && event.eventTimestampMs <= existing.lastEventAt.getTime()) {
    return null;
  }

  const eventAt = new Date(event.eventTimestampMs);
  const base: SubscriptionUpsert = {
    userId: event.appUserId,
    rcAppUserId: event.appUserId,
    // Fields the event may omit (notably TRANSFER) fall back to the cached value.
    productId: event.productId || existing?.productId || '',
    store: event.store,
    environment: event.environment,
    purchasedAt: new Date(event.purchasedAtMs),
    expiresAt: event.expirationAtMs !== null ? new Date(event.expirationAtMs) : (existing?.expiresAt ?? null),
    willRenew: true,
    unsubscribeDetectedAt: null,
    billingIssuesDetectedAt: null,
    lastEventId: event.id,
    lastEventAt: eventAt,
  };

  switch (event.type) {
    case 'INITIAL_PURCHASE':
    case 'RENEWAL':
    case 'UNCANCELLATION':
    case 'PRODUCT_CHANGE':
    case 'TRANSFER':
      return base;
    case 'CANCELLATION':
      return { ...base, willRenew: false, unsubscribeDetectedAt: eventAt };
    case 'BILLING_ISSUE':
      return {
        ...base,
        // Access unchanged; only record the flag. Preserve the prior renew
        // intent and any earlier unsubscribe stamp rather than resetting them.
        willRenew: existing?.willRenew ?? base.willRenew,
        unsubscribeDetectedAt: existing?.unsubscribeDetectedAt ?? null,
        billingIssuesDetectedAt: eventAt,
      };
    case 'EXPIRATION':
      return { ...base, willRenew: false };
  }
}
