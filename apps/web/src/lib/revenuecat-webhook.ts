/**
 * The decision + processing logic behind `POST /api/webhooks/revenuecat`, kept
 * free of any `next/server` import so it is unit-testable under the plain node
 * test runner (mirrors `lib/resend-inbound-webhook.ts`). The route handler is a
 * thin adapter: it reads the raw body + Authorization header off the Request and
 * hands them here, then maps the returned `{ status, body }`.
 *
 * RevenueCat is the single source of entitlement truth for BOTH platforms — iOS
 * in-app purchases report to RC directly, and web Stripe purchases are forwarded
 * into RC by RC's Stripe integration (unified by the `app_user_id` we stamp on
 * the Stripe subscription). This webhook is how RC pushes that truth to us; the
 * Neon `subscriptions` table is a CACHE this handler writes.
 *
 * DORMANT until provisioned. Era+ is DARK behind a feature flag AND real
 * credentials: unless `ERA_PLUS_ENABLED` is 'true' AND a real
 * `REVENUECAT_WEBHOOK_AUTH_TOKEN` is set, every call gets 404 (the endpoint
 * simply does not exist yet), so it is inert on a fresh deploy.
 *
 * AUTH. RC signs its webhook with a fixed Authorization header value you
 * configure in the RC dashboard. We compare the incoming header to the
 * configured token in CONSTANT TIME (crypto.timingSafeEqual on equal-length
 * buffers; a length check first — the configured token's length is not itself a
 * secret, and timingSafeEqual throws on unequal lengths — then a constant-time
 * compare so a correct-length guess cannot be distinguished by timing).
 *
 * IDEMPOTENCY / ORDERING — no transaction. The `@era/db` client is the Neon HTTP
 * driver, which has NO interactive transactions. So the upsert is a SINGLE
 * `onConflictDoUpdate` statement guarded by `last_event_at`: an event no newer
 * than the cached one is a no-op both in the pure mapper (applyRevenueCatEvent
 * returns null on `event_timestamp_ms <= lastEventAt`, which also makes an exact
 * replay idempotent) AND at the SQL layer (`setWhere` on the conflict update, so
 * a delivery that races past our read still can't regress the row).
 *
 * PRIVACY. The token is NEVER logged and NEVER placed in a result; the raw
 * payload is never logged — only an event class. RC's test events carry fake
 * `app_user_id`s, so an id that maps to no user is accepted with a logged skip
 * (a 200, so RC does not retry it forever), never an error.
 *
 * Contract:
 *   - 404  flag off or no real auth token — DORMANT, no work.
 *   - 401  missing/mismatched Authorization — constant-time checked.
 *   - 200  everything else: bad JSON, an event type we don't consume, an unknown
 *          user (test event), a stale/replayed event, or a successful upsert.
 *          Always a minimal fixed-enum body.
 */
import { timingSafeEqual } from 'node:crypto';

import { eq, lt } from 'drizzle-orm';

import { applyRevenueCatEvent, isEraPlusEnabled, parseRevenueCatEvent, type SubscriptionUpsert } from '@era/core';
import { createDbClient, subscriptions, user, type Subscription } from '@era/db';

import { isRealCredential } from './send-email.ts';

const db = createDbClient(process.env.DATABASE_URL!);

/** Cap the raw webhook body (bytes). A RevenueCat event is a small JSON object. */
export const MAX_REVENUECAT_WEBHOOK_BODY_BYTES = 64 * 1024;

/** The status + JSON body the route maps onto a NextResponse. */
export interface RevenueCatWebhookResult {
  readonly status: 404 | 401 | 200;
  readonly body: { readonly error: string } | { readonly received: true };
}

/** Everything the handler needs off the request, resolved by the route adapter. */
export interface RevenueCatWebhookInput {
  readonly rawBody: string;
  /** The raw `Authorization` header value (null when absent). */
  readonly authorization: string | null;
}

/**
 * Injectable seams for testing: the env source, the user-existence check, the
 * cached-row load, the upsert, and the log sink. All default to the real
 * implementations so the route adapter passes nothing.
 */
export interface RevenueCatWebhookDeps {
  readonly env?: Record<string, string | undefined>;
  readonly userExists?: (userId: string) => Promise<boolean>;
  readonly loadSubscription?: (userId: string) => Promise<Subscription | null>;
  readonly upsertSubscription?: (values: SubscriptionUpsert) => Promise<void>;
  readonly log?: (message: string) => void;
}

const OK: RevenueCatWebhookResult = { status: 200, body: { received: true } };
const NOT_FOUND: RevenueCatWebhookResult = { status: 404, body: { error: 'not found' } };
const UNAUTHORIZED: RevenueCatWebhookResult = { status: 401, body: { error: 'unauthorized' } };

/**
 * True only when Era+ is enabled AND the webhook has a real (non-placeholder)
 * auth token. The route short-circuits to 404 when this is false.
 */
export function isRevenueCatWebhookConfigured(env: Record<string, string | undefined>): boolean {
  return isEraPlusEnabled(env.ERA_PLUS_ENABLED) && isRealCredential(env.REVENUECAT_WEBHOOK_AUTH_TOKEN);
}

/**
 * Constant-time equality of the provided Authorization header and the configured
 * token. The length check first is safe — the configured token length is fixed
 * and not a per-request secret — and guards `timingSafeEqual`, which throws on
 * unequal-length buffers; the equal-length path is then compared in constant
 * time so a correct-length guess leaks nothing through timing.
 */
function authorizationMatches(provided: string | null, expected: string): boolean {
  if (provided === null) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/** Default user-existence check: is there a Better Auth user with this id? */
async function userExistsInDb(userId: string): Promise<boolean> {
  const [row] = await db.select({ id: user.id }).from(user).where(eq(user.id, userId)).limit(1);
  return row !== undefined;
}

/** Default cached-row load: the current subscription snapshot for a user, or null. */
async function loadSubscriptionFromDb(userId: string): Promise<Subscription | null> {
  const [row] = await db.select().from(subscriptions).where(eq(subscriptions.userId, userId)).limit(1);
  return row ?? null;
}

/**
 * Default upsert: a SINGLE `onConflictDoUpdate` statement. On first event it
 * inserts; on a later event it updates only when strictly newer (`setWhere` on
 * `last_event_at`), so a raced or replayed delivery can never regress the cache.
 * `stripe_customer_id` is deliberately NOT in the update set — that column is
 * owned by the web checkout route, never this webhook — so an existing customer
 * id survives every RC event untouched. On a fresh INSERT it defaults to null.
 */
async function upsertSubscriptionInDb(values: SubscriptionUpsert): Promise<void> {
  await db
    .insert(subscriptions)
    .values(values)
    .onConflictDoUpdate({
      target: subscriptions.userId,
      set: {
        rcAppUserId: values.rcAppUserId,
        productId: values.productId,
        store: values.store,
        environment: values.environment,
        purchasedAt: values.purchasedAt,
        expiresAt: values.expiresAt,
        willRenew: values.willRenew,
        unsubscribeDetectedAt: values.unsubscribeDetectedAt,
        billingIssuesDetectedAt: values.billingIssuesDetectedAt,
        lastEventId: values.lastEventId,
        lastEventAt: values.lastEventAt,
      },
      setWhere: lt(subscriptions.lastEventAt, values.lastEventAt),
    });
}

/**
 * Process one RevenueCat webhook delivery. Pure of `next/server`; the route
 * adapter turns the result into a response. Assumes the caller applied the
 * body-size cap.
 */
export async function handleRevenueCatWebhook(
  input: RevenueCatWebhookInput,
  deps: RevenueCatWebhookDeps = {},
): Promise<RevenueCatWebhookResult> {
  const env = deps.env ?? process.env;
  const log = deps.log ?? console.log;

  // Dormant until provisioned: flag off or no real token → the endpoint 404s.
  const token = env.REVENUECAT_WEBHOOK_AUTH_TOKEN;
  if (!isEraPlusEnabled(env.ERA_PLUS_ENABLED) || !isRealCredential(token)) {
    return NOT_FOUND;
  }

  // A missing/empty or over-cap body can't be a legitimate delivery → 401.
  if (input.rawBody.length === 0 || input.rawBody.length > MAX_REVENUECAT_WEBHOOK_BODY_BYTES) {
    return UNAUTHORIZED;
  }

  // Constant-time auth. Never log the token or the compared header.
  if (!authorizationMatches(input.authorization, token)) {
    return UNAUTHORIZED;
  }

  // Parse the payload. Bad JSON post-auth is accepted + ignored (200) so RC does
  // not retry a permanently-broken body; we log only that it was unparseable.
  let payload: unknown;
  try {
    payload = JSON.parse(input.rawBody);
  } catch {
    log('[era-revenuecat] unparseable body: ignored');
    return OK;
  }

  const rawEvent = (payload as { event?: unknown } | null)?.event;
  const event = parseRevenueCatEvent(rawEvent);
  if (event === null) {
    // Malformed, or a type we do not consume (e.g. TEST / SUBSCRIPTION_PAUSED).
    const type = (rawEvent as { type?: unknown } | null)?.type;
    // JSON.stringify quotes and escapes the attacker-influenced value so a
    // newline can't forge a separate log entry (Sentinel N3); slice caps noise.
    log(`[era-revenuecat] event ${typeof type === 'string' ? JSON.stringify(type).slice(0, 66) : 'unknown'}: ignored`);
    return OK;
  }

  // Validate the app_user_id maps to a real user. RC's test events use fake ids;
  // accept them with a logged skip (200) so RC does not retry them forever.
  const userExists = deps.userExists ?? userExistsInDb;
  if (!(await userExists(event.appUserId))) {
    log(`[era-revenuecat] ${event.type}: no matching user (test event?) — skipped`);
    return OK;
  }

  // Fold the event onto the cached row. A stale/replayed event maps to null.
  const loadSubscription = deps.loadSubscription ?? loadSubscriptionFromDb;
  const existing = await loadSubscription(event.appUserId);
  const values = applyRevenueCatEvent(existing, event);
  if (values === null) {
    log(`[era-revenuecat] ${event.type}: stale/replayed — no-op`);
    return OK;
  }

  const upsertSubscription = deps.upsertSubscription ?? upsertSubscriptionInDb;
  await upsertSubscription(values);
  log(`[era-revenuecat] ${event.type}: applied`);
  return OK;
}
