/**
 * Unit tests for the pure Era+ entitlement logic and the RevenueCat event mapper.
 *
 * No db, no env, no network — every function here is total over its inputs:
 *   - isEraPlusEnabled  — only the exact 'true' turns it on
 *   - isPlus            — null sub, null (non-expiring) expiry, and the exact
 *                         now === expiresAt boundary
 *   - parseRevenueCatEvent — normalization, unknown-type/malformed → null
 *   - applyRevenueCatEvent — the INITIAL_PURCHASE → RENEWAL → CANCELLATION →
 *                            EXPIRATION lifecycle, stale/replay no-ops, and the
 *                            billing-issue-doesn't-cut-access rule
 *
 * Run: node --experimental-strip-types --test src/plus.test.ts
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  applyRevenueCatEvent,
  isEraPlusEnabled,
  isPlus,
  parseRevenueCatEvent,
  type RevenueCatEvent,
} from './plus.ts';
import type { Subscription } from '@era/db';

const USER = 'user-1';

/** A cached subscription row with sensible defaults, overridable per test. */
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
    lastEventId: 'evt_0',
    lastEventAt: now,
    createdAt: now,
    updatedAt: now,
    ...over,
  };
}

/** A raw RevenueCat webhook `event` object (the payload's `body.event`). */
function rawEvent(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
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
  };
}

/** Parse a raw event, asserting it wasn't rejected — for the mapper tests. */
function parsed(over: Record<string, unknown> = {}): RevenueCatEvent {
  const event = parseRevenueCatEvent(rawEvent(over));
  assert.ok(event, 'expected a parseable event');
  return event;
}

// --- isEraPlusEnabled -------------------------------------------------------

test('isEraPlusEnabled is true only for the exact string "true"', () => {
  assert.equal(isEraPlusEnabled('true'), true);
  assert.equal(isEraPlusEnabled('TRUE'), false);
  assert.equal(isEraPlusEnabled('1'), false);
  assert.equal(isEraPlusEnabled('yes'), false);
  assert.equal(isEraPlusEnabled(''), false);
  assert.equal(isEraPlusEnabled(undefined), false);
});

// --- isPlus -----------------------------------------------------------------

test('isPlus: no subscription → false', () => {
  assert.equal(isPlus(null), false);
  assert.equal(isPlus(undefined), false);
});

test('isPlus: null expiresAt (non-expiring) → always true', () => {
  assert.equal(isPlus({ expiresAt: null }, new Date('2099-01-01T00:00:00.000Z')), true);
});

test('isPlus: active while expiresAt is in the future, expired once past', () => {
  const expiresAt = new Date('2026-08-01T00:00:00.000Z');
  assert.equal(isPlus({ expiresAt }, new Date('2026-07-31T23:59:59.000Z')), true);
  assert.equal(isPlus({ expiresAt }, new Date('2026-08-01T00:00:01.000Z')), false);
});

test('isPlus: the now === expiresAt boundary is NOT active (expiry is exclusive)', () => {
  const expiresAt = new Date('2026-08-01T00:00:00.000Z');
  assert.equal(isPlus({ expiresAt }, new Date(expiresAt)), false);
});

test('isPlus: a sandbox row is denied by default — a free purchase must not grant prod Plus', () => {
  const now = new Date('2026-07-01T00:00:00.000Z');
  const active = { expiresAt: new Date('2026-08-01T00:00:00.000Z'), environment: 'sandbox' };
  assert.equal(isPlus(active, now), false);
  assert.equal(isPlus({ expiresAt: null, environment: 'sandbox' }, now), false);
});

test('isPlus: sandbox rows count only under the explicit E2E opt-in (and still expire)', () => {
  const now = new Date('2026-07-01T00:00:00.000Z');
  const active = { expiresAt: new Date('2026-08-01T00:00:00.000Z'), environment: 'sandbox' };
  assert.equal(isPlus(active, now, { allowSandboxEntitlements: true }), true);
  const expired = { expiresAt: new Date('2026-06-01T00:00:00.000Z'), environment: 'sandbox' };
  assert.equal(isPlus(expired, now, { allowSandboxEntitlements: true }), false);
});

test('isPlus: production and environment-less (trimmed) rows are unaffected by the sandbox gate', () => {
  const now = new Date('2026-07-01T00:00:00.000Z');
  const expiresAt = new Date('2026-08-01T00:00:00.000Z');
  assert.equal(isPlus({ expiresAt, environment: 'production' }, now), true);
  assert.equal(isPlus({ expiresAt }, now), true);
});

// --- parseRevenueCatEvent ---------------------------------------------------

test('parseRevenueCatEvent normalizes store, environment, and timestamps', () => {
  const event = parsed();
  assert.equal(event.id, 'evt_1');
  assert.equal(event.type, 'INITIAL_PURCHASE');
  assert.equal(event.appUserId, USER);
  assert.equal(event.store, 'app_store');
  assert.equal(event.environment, 'production');
  assert.equal(event.expirationAtMs, Date.parse('2026-08-01T00:00:00.000Z'));
});

test('parseRevenueCatEvent maps the store variants', () => {
  assert.equal(parsed({ store: 'MAC_APP_STORE' }).store, 'app_store');
  assert.equal(parsed({ store: 'PLAY_STORE' }).store, 'play_store');
  assert.equal(parsed({ store: 'STRIPE' }).store, 'stripe');
  assert.equal(parsed({ store: 'RC_BILLING' }).store, 'stripe');
  assert.equal(parsed({ store: 'PROMOTIONAL' }).store, 'promotional');
});

test('parseRevenueCatEvent rejects unknown event types (accept-and-ignore upstream)', () => {
  assert.equal(parseRevenueCatEvent(rawEvent({ type: 'SUBSCRIPTION_PAUSED' })), null);
  assert.equal(parseRevenueCatEvent(rawEvent({ type: 'TEST' })), null);
});

test('parseRevenueCatEvent rejects malformed events and non-objects', () => {
  assert.equal(parseRevenueCatEvent(null), null);
  assert.equal(parseRevenueCatEvent('nope'), null);
  assert.equal(parseRevenueCatEvent(rawEvent({ id: undefined })), null);
  assert.equal(parseRevenueCatEvent(rawEvent({ app_user_id: '' })), null);
  assert.equal(parseRevenueCatEvent(rawEvent({ store: 'AMAZON' })), null);
  assert.equal(parseRevenueCatEvent(rawEvent({ environment: 'STAGING' })), null);
  assert.equal(parseRevenueCatEvent(rawEvent({ event_timestamp_ms: 'soon' })), null);
});

test('parseRevenueCatEvent: a non-expiring grant carries a null expiration', () => {
  assert.equal(parsed({ expiration_at_ms: null }).expirationAtMs, null);
});

// --- applyRevenueCatEvent: lifecycle ----------------------------------------

test('INITIAL_PURCHASE with no cached row → active grant, flags clear', () => {
  const row = applyRevenueCatEvent(null, parsed());
  assert.ok(row);
  assert.equal(row.userId, USER);
  assert.equal(row.rcAppUserId, USER);
  assert.equal(row.productId, 'era_plus_monthly');
  assert.equal(row.willRenew, true);
  assert.equal(row.unsubscribeDetectedAt, null);
  assert.equal(row.billingIssuesDetectedAt, null);
  assert.deepEqual(row.expiresAt, new Date('2026-08-01T00:00:00.000Z'));
  assert.equal(row.lastEventId, 'evt_1');
  assert.equal(isPlus(row, new Date('2026-07-15T00:00:00.000Z')), true);
});

test('full lifecycle: INITIAL_PURCHASE → RENEWAL → CANCELLATION → EXPIRATION', () => {
  // 1) purchase
  const afterPurchase = applyRevenueCatEvent(null, parsed({ id: 'evt_1' }));
  assert.ok(afterPurchase);

  // 2) renewal a month later extends the expiry, still auto-renewing
  const renewalAt = Date.parse('2026-08-01T00:00:00.000Z');
  const afterRenewal = applyRevenueCatEvent(
    subRow(afterPurchase),
    parsed({
      id: 'evt_2',
      type: 'RENEWAL',
      purchased_at_ms: renewalAt,
      expiration_at_ms: Date.parse('2026-09-01T00:00:00.000Z'),
      event_timestamp_ms: renewalAt,
    }),
  );
  assert.ok(afterRenewal);
  assert.equal(afterRenewal.willRenew, true);
  assert.deepEqual(afterRenewal.expiresAt, new Date('2026-09-01T00:00:00.000Z'));

  // 3) cancellation: auto-renew off, unsubscribe stamped, BUT access stays to expiry
  const cancelAt = Date.parse('2026-08-10T00:00:00.000Z');
  const afterCancel = applyRevenueCatEvent(
    subRow(afterRenewal),
    parsed({ id: 'evt_3', type: 'CANCELLATION', expiration_at_ms: Date.parse('2026-09-01T00:00:00.000Z'), event_timestamp_ms: cancelAt }),
  );
  assert.ok(afterCancel);
  assert.equal(afterCancel.willRenew, false);
  assert.deepEqual(afterCancel.unsubscribeDetectedAt, new Date(cancelAt));
  assert.deepEqual(afterCancel.expiresAt, new Date('2026-09-01T00:00:00.000Z'));
  assert.equal(isPlus(afterCancel, new Date('2026-08-15T00:00:00.000Z')), true, 'still Plus after cancel, before expiry');

  // 4) expiration: access ends
  const expireAt = Date.parse('2026-09-01T00:00:00.000Z');
  const afterExpire = applyRevenueCatEvent(
    subRow(afterCancel),
    parsed({ id: 'evt_4', type: 'EXPIRATION', expiration_at_ms: expireAt, event_timestamp_ms: expireAt }),
  );
  assert.ok(afterExpire);
  assert.equal(afterExpire.willRenew, false);
  assert.equal(isPlus(afterExpire, new Date('2026-09-02T00:00:00.000Z')), false);
});

test('UNCANCELLATION clears the unsubscribe flag and turns auto-renew back on', () => {
  const cancelled = subRow({ willRenew: false, unsubscribeDetectedAt: new Date('2026-08-10T00:00:00.000Z'), lastEventAt: new Date('2026-08-10T00:00:00.000Z') });
  const row = applyRevenueCatEvent(cancelled, parsed({ id: 'evt_5', type: 'UNCANCELLATION', event_timestamp_ms: Date.parse('2026-08-12T00:00:00.000Z') }));
  assert.ok(row);
  assert.equal(row.willRenew, true);
  assert.equal(row.unsubscribeDetectedAt, null);
});

test('BILLING_ISSUE stamps the flag but does NOT change expiresAt or cut access', () => {
  const active = subRow({ lastEventAt: new Date('2026-07-01T00:00:00.000Z') });
  const issueAt = Date.parse('2026-07-20T00:00:00.000Z');
  const row = applyRevenueCatEvent(
    active,
    // RC often omits a new expiration on a billing issue — the mapper keeps the cached one.
    parsed({ id: 'evt_6', type: 'BILLING_ISSUE', expiration_at_ms: null, event_timestamp_ms: issueAt }),
  );
  assert.ok(row);
  assert.deepEqual(row.billingIssuesDetectedAt, new Date(issueAt));
  assert.deepEqual(row.expiresAt, active.expiresAt, 'expiry unchanged by a billing issue');
  assert.equal(isPlus(row, new Date('2026-07-25T00:00:00.000Z')), true, 'access continues through the grace period');
});

// --- applyRevenueCatEvent: staleness / idempotency --------------------------

test('a stale (older) event is ignored → null', () => {
  const current = subRow({ lastEventAt: new Date('2026-07-10T00:00:00.000Z') });
  const stale = applyRevenueCatEvent(current, parsed({ id: 'evt_old', type: 'RENEWAL', event_timestamp_ms: Date.parse('2026-07-05T00:00:00.000Z') }));
  assert.equal(stale, null);
});

test('an exact replay (same timestamp) is idempotent → null', () => {
  const at = Date.parse('2026-07-10T00:00:00.000Z');
  const current = subRow({ lastEventAt: new Date(at) });
  const replay = applyRevenueCatEvent(current, parsed({ id: 'evt_dup', type: 'RENEWAL', event_timestamp_ms: at }));
  assert.equal(replay, null);
});

test('a strictly newer event applies', () => {
  const current = subRow({ lastEventAt: new Date('2026-07-10T00:00:00.000Z') });
  const row = applyRevenueCatEvent(current, parsed({ id: 'evt_new', type: 'RENEWAL', event_timestamp_ms: Date.parse('2026-07-11T00:00:00.000Z') }));
  assert.ok(row);
  assert.equal(row.lastEventId, 'evt_new');
});

test('TRANSFER with no product/expiration inherits them from the cached row', () => {
  const current = subRow({ productId: 'era_plus_annual', expiresAt: new Date('2027-01-01T00:00:00.000Z'), lastEventAt: new Date('2026-07-01T00:00:00.000Z') });
  const row = applyRevenueCatEvent(
    current,
    parsed({ id: 'evt_t', type: 'TRANSFER', product_id: '', expiration_at_ms: null, event_timestamp_ms: Date.parse('2026-07-05T00:00:00.000Z') }),
  );
  assert.ok(row);
  assert.equal(row.productId, 'era_plus_annual');
  assert.deepEqual(row.expiresAt, new Date('2027-01-01T00:00:00.000Z'));
});
