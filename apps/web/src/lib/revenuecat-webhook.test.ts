/**
 * Unit tests for the RevenueCat webhook handler logic.
 *
 * No live DB, no real auth secret: every seam (userExists, loadSubscription,
 * upsertSubscription) is injected, so the full contract is deterministic —
 *   - flag off / no real token / placeholder token → 404, no work
 *   - empty / oversized body                       → 401, no work
 *   - missing / wrong / length-mismatched auth     → 401, no work
 *   - unconsumed event type / bad JSON             → 200, no upsert
 *   - unknown user (RC test event)                 → 200, no load/upsert
 *   - stale / replayed event                       → 200, no upsert
 *   - happy path                                   → upsert(mapped values), 200
 *   - response/log hygiene                         → no token/payload leaks
 *
 * Run: node --experimental-strip-types --test apps/web/src/lib/revenuecat-webhook.test.ts
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  MAX_REVENUECAT_WEBHOOK_BODY_BYTES,
  handleRevenueCatWebhook,
  isRevenueCatWebhookConfigured,
  type RevenueCatWebhookDeps,
} from './revenuecat-webhook.ts';
import type { SubscriptionUpsert } from '@era/core';
import type { Subscription } from '@era/db';

const REAL_TOKEN = 'rcauth_supersecrettoken_123456';
const USER = 'user-1';

/** A full env with Era+ enabled and a real token. */
function enabledEnv(over: Record<string, string | undefined> = {}): Record<string, string | undefined> {
  return { ERA_PLUS_ENABLED: 'true', REVENUECAT_WEBHOOK_AUTH_TOKEN: REAL_TOKEN, ...over };
}

/** A raw RevenueCat webhook payload (`{ event, api_version }`). */
function payload(over: Record<string, unknown> = {}): string {
  return JSON.stringify({
    api_version: '1.0',
    event: {
      id: 'evt_1',
      type: 'INITIAL_PURCHASE',
      app_user_id: USER,
      product_id: 'era_plus_monthly',
      store: 'APP_STORE',
      environment: 'PRODUCTION',
      purchased_at_ms: Date.parse('2026-07-01T00:00:00.000Z'),
      expiration_at_ms: Date.parse('2026-08-01T00:00:00.000Z'),
      event_timestamp_ms: Date.parse('2026-07-01T00:00:00.000Z'),
      ...over,
    },
  });
}

/** A spy bundle recording every seam invocation, with passing defaults. */
function spies(over: Partial<RevenueCatWebhookDeps> = {}) {
  const calls = {
    userExists: [] as string[],
    loadSubscription: [] as string[],
    upsert: [] as SubscriptionUpsert[],
    logs: [] as string[],
  };
  const deps: RevenueCatWebhookDeps = {
    env: enabledEnv(),
    userExists: (userId) => {
      calls.userExists.push(userId);
      return Promise.resolve(true);
    },
    loadSubscription: (userId) => {
      calls.loadSubscription.push(userId);
      return Promise.resolve(null); // no cached row by default
    },
    upsertSubscription: (values) => {
      calls.upsert.push(values);
      return Promise.resolve();
    },
    log: (m) => {
      calls.logs.push(m);
    },
    ...over,
  };
  return { deps, calls };
}

/** A cached subscription row for the stale/replay tests. */
function subRow(over: Partial<Subscription> = {}): Subscription {
  const now = new Date('2026-07-01T00:00:00.000Z');
  return {
    userId: USER,
    rcAppUserId: USER,
    productId: 'era_plus_monthly',
    store: 'app_store',
    environment: 'production',
    purchasedAt: now,
    expiresAt: new Date('2026-08-01T00:00:00.000Z'),
    willRenew: true,
    unsubscribeDetectedAt: null,
    billingIssuesDetectedAt: null,
    stripeCustomerId: null,
    lastEventId: 'evt_1',
    lastEventAt: now,
    createdAt: now,
    updatedAt: now,
    ...over,
  };
}

/** A delivery with a valid Authorization header. */
function authed(body: string): { rawBody: string; authorization: string } {
  return { rawBody: body, authorization: REAL_TOKEN };
}

// --- dormancy ---------------------------------------------------------------

test('flag off → 404, does no work', async () => {
  const { deps, calls } = spies({ env: { REVENUECAT_WEBHOOK_AUTH_TOKEN: REAL_TOKEN } });
  const res = await handleRevenueCatWebhook(authed(payload()), deps);
  assert.equal(res.status, 404);
  assert.equal(calls.userExists.length, 0);
  assert.equal(calls.upsert.length, 0);
});

test('no token → 404', async () => {
  const { deps } = spies({ env: { ERA_PLUS_ENABLED: 'true' } });
  const res = await handleRevenueCatWebhook(authed(payload()), deps);
  assert.equal(res.status, 404);
});

test('placeholder token is treated as absent → 404', async () => {
  const { deps } = spies({ env: enabledEnv({ REVENUECAT_WEBHOOK_AUTH_TOKEN: 'change-me-rc-token' }) });
  const res = await handleRevenueCatWebhook({ rawBody: payload(), authorization: 'change-me-rc-token' }, deps);
  assert.equal(res.status, 404);
});

test('isRevenueCatWebhookConfigured mirrors the dormancy gate', () => {
  assert.equal(isRevenueCatWebhookConfigured({}), false);
  assert.equal(isRevenueCatWebhookConfigured({ ERA_PLUS_ENABLED: 'true' }), false);
  assert.equal(isRevenueCatWebhookConfigured({ REVENUECAT_WEBHOOK_AUTH_TOKEN: REAL_TOKEN }), false);
  assert.equal(isRevenueCatWebhookConfigured({ ERA_PLUS_ENABLED: '1', REVENUECAT_WEBHOOK_AUTH_TOKEN: REAL_TOKEN }), false);
  assert.equal(isRevenueCatWebhookConfigured(enabledEnv()), true);
});

// --- body bounds ------------------------------------------------------------

test('empty body → 401 (before auth)', async () => {
  const { deps, calls } = spies();
  const res = await handleRevenueCatWebhook({ rawBody: '', authorization: REAL_TOKEN }, deps);
  assert.equal(res.status, 401);
  assert.equal(calls.userExists.length, 0);
});

test('oversized body → 401', async () => {
  const { deps } = spies();
  const res = await handleRevenueCatWebhook(
    { rawBody: 'x'.repeat(MAX_REVENUECAT_WEBHOOK_BODY_BYTES + 1), authorization: REAL_TOKEN },
    deps,
  );
  assert.equal(res.status, 401);
});

// --- auth -------------------------------------------------------------------

test('missing Authorization → 401', async () => {
  const { deps, calls } = spies();
  const res = await handleRevenueCatWebhook({ rawBody: payload(), authorization: null }, deps);
  assert.equal(res.status, 401);
  assert.equal(calls.userExists.length, 0);
});

test('wrong token (same length) → 401', async () => {
  const { deps, calls } = spies();
  const wrong = 'x'.repeat(REAL_TOKEN.length);
  const res = await handleRevenueCatWebhook({ rawBody: payload(), authorization: wrong }, deps);
  assert.equal(res.status, 401);
  assert.equal(calls.upsert.length, 0);
});

test('length-mismatched token → 401 (no timingSafeEqual throw)', async () => {
  const { deps } = spies();
  const res = await handleRevenueCatWebhook({ rawBody: payload(), authorization: 'short' }, deps);
  assert.equal(res.status, 401);
});

// --- routing / no-op --------------------------------------------------------

test('bad JSON post-auth → 200, no upsert (do not make RC retry a broken body)', async () => {
  const { deps, calls } = spies();
  const res = await handleRevenueCatWebhook(authed('{not json'), deps);
  assert.equal(res.status, 200);
  assert.deepEqual(res.body, { received: true });
  assert.equal(calls.userExists.length, 0);
  assert.equal(calls.upsert.length, 0);
});

test('unconsumed event type → 200, no user check, no upsert', async () => {
  const { deps, calls } = spies();
  const res = await handleRevenueCatWebhook(authed(payload({ type: 'SUBSCRIPTION_PAUSED' })), deps);
  assert.equal(res.status, 200);
  assert.equal(calls.userExists.length, 0);
  assert.equal(calls.upsert.length, 0);
});

test('unknown user (RC test event) → 200, no load/upsert', async () => {
  // Override userExists to reject: the id resolves to no user (RC test event).
  const { deps, calls } = spies({ userExists: () => Promise.resolve(false) });
  const res = await handleRevenueCatWebhook(authed(payload({ app_user_id: 'fake-rc-tester' })), deps);
  assert.equal(res.status, 200);
  // We stop at the user check — no cached-row load, no upsert.
  assert.equal(calls.loadSubscription.length, 0);
  assert.equal(calls.upsert.length, 0);
});

// --- idempotency / ordering -------------------------------------------------

test('stale event (older than cached) → 200, no upsert', async () => {
  const current = subRow({ lastEventAt: new Date('2026-07-10T00:00:00.000Z') });
  const { deps, calls } = spies({ loadSubscription: () => Promise.resolve(current) });
  const res = await handleRevenueCatWebhook(
    authed(payload({ id: 'evt_old', type: 'RENEWAL', event_timestamp_ms: Date.parse('2026-07-05T00:00:00.000Z') })),
    deps,
  );
  assert.equal(res.status, 200);
  assert.equal(calls.upsert.length, 0);
});

test('exact replay (same timestamp as cached) → 200, no upsert', async () => {
  const at = Date.parse('2026-07-01T00:00:00.000Z');
  const current = subRow({ lastEventAt: new Date(at) });
  const { deps, calls } = spies({ loadSubscription: () => Promise.resolve(current) });
  const res = await handleRevenueCatWebhook(authed(payload({ event_timestamp_ms: at })), deps);
  assert.equal(res.status, 200);
  assert.equal(calls.upsert.length, 0);
});

// --- happy path -------------------------------------------------------------

test('INITIAL_PURCHASE with no cached row → upsert(mapped values), 200', async () => {
  const { deps, calls } = spies();
  const res = await handleRevenueCatWebhook(authed(payload()), deps);
  assert.equal(res.status, 200);
  assert.deepEqual(res.body, { received: true });
  assert.deepEqual(calls.userExists, [USER]);
  assert.deepEqual(calls.loadSubscription, [USER]);
  assert.equal(calls.upsert.length, 1);
  const row = calls.upsert[0]!;
  assert.equal(row.userId, USER);
  assert.equal(row.productId, 'era_plus_monthly');
  assert.equal(row.store, 'app_store');
  assert.equal(row.willRenew, true);
  assert.equal(row.lastEventId, 'evt_1');
  // The mapper never sets stripeCustomerId (owned by checkout) — it's absent.
  assert.equal('stripeCustomerId' in row, false);
});

test('a strictly newer event over a cached row upserts', async () => {
  const current = subRow({ lastEventAt: new Date('2026-07-01T00:00:00.000Z') });
  const { deps, calls } = spies({ loadSubscription: () => Promise.resolve(current) });
  const res = await handleRevenueCatWebhook(
    authed(payload({ id: 'evt_2', type: 'RENEWAL', event_timestamp_ms: Date.parse('2026-08-01T00:00:00.000Z') })),
    deps,
  );
  assert.equal(res.status, 200);
  assert.equal(calls.upsert.length, 1);
  assert.equal(calls.upsert[0]!.lastEventId, 'evt_2');
});

// --- hygiene ----------------------------------------------------------------

test('the auth token never leaks into the response or logs', async () => {
  const { deps, calls } = spies();
  const res = await handleRevenueCatWebhook(authed(payload()), deps);
  const serialized = JSON.stringify(res.body) + '\n' + calls.logs.join('\n');
  assert.ok(!serialized.includes(REAL_TOKEN), 'token must not leak');
  assert.deepEqual(res.body, { received: true });
});
