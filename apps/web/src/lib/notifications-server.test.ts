/**
 * Unit tests for the notification persistence helpers — no live DB. A chainable
 * fake records every query-builder call (mirroring saved-products-server.test.ts's
 * stand-in) so we can assert the operation shape: preference get-default vs.
 * owner-scoped upsert, the owner-scoped + capped notification feed, the
 * owner-scoped mark-read, and the idempotent push-token register/delete. The
 * view mapping (dates → ISO, defaults) is asserted through the returned shapes.
 *
 * Route auth (401/403 via requireUser + isSameOrigin) and the payload 400s live in
 * the route handlers and @era/core's authz tests; the routes reuse those guards.
 *
 * Run: node --experimental-strip-types --test apps/web/src/lib/notifications-server.test.ts
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  type DbClient,
  type InAppNotification,
  type NotificationPreference,
  inAppNotifications,
  notificationPreferences,
  pushTokens,
} from '@era/db';

import {
  findInAppNotification,
  getNotificationPreferences,
  listInAppNotifications,
  markInAppNotificationRead,
  registerPushToken,
  unregisterPushToken,
  upsertNotificationPreferences,
} from './notifications-server.ts';

/** One recorded query-builder call. */
interface Call {
  readonly m: string;
  readonly args: readonly unknown[];
}

/**
 * Chainable Drizzle stand-in: every method records its call and returns the same
 * thenable chain; awaiting the chain resolves to `rows`. Mirrors the fake in
 * saved-products-server.test.ts.
 */
function fakeDb(rows: unknown[] = []): { db: DbClient; calls: Call[] } {
  const calls: Call[] = [];
  const chain: Record<string | symbol, unknown> = {
    then: (resolve: (r: unknown[]) => unknown, reject: (e: unknown) => unknown) =>
      Promise.resolve(rows).then(resolve, reject),
  };
  const handler: ProxyHandler<Record<string | symbol, unknown>> = {
    get(target, prop) {
      if (prop === 'then') {
        return target.then;
      }
      return (...args: unknown[]) => {
        calls.push({ m: String(prop), args });
        return proxy;
      };
    },
  };
  const proxy = new Proxy(chain, handler);
  return { db: proxy as unknown as DbClient, calls };
}

const USER = 'user-1';
const OTHER = 'user-2';

function prefsRow(over: Partial<NotificationPreference> = {}): NotificationPreference {
  return {
    userId: USER,
    priceAlertsEnabled: true,
    emailAlerts: false,
    pushAlerts: true,
    updatedAt: new Date('2026-07-05T00:00:00Z'),
    ...over,
  };
}

function notificationRow(over: Partial<InAppNotification> = {}): InAppNotification {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    userId: USER,
    kind: 'price_drop',
    payload: { productId: 'p-1', newPriceCents: 3900 },
    readAt: null,
    createdAt: new Date('2026-07-05T00:00:00Z'),
    ...over,
  };
}

// --- preferences ------------------------------------------------------------

test('getNotificationPreferences returns all-off defaults when no row exists', async () => {
  const { db, calls } = fakeDb([]);
  const prefs = await getNotificationPreferences(db, USER);

  assert.equal(calls.find((c) => c.m === 'from')?.args[0], notificationPreferences);
  assert.ok(calls.find((c) => c.m === 'where'), 'select is owner-scoped');
  assert.deepEqual(prefs, { priceAlertsEnabled: false, emailAlerts: false, pushAlerts: false });
});

test('getNotificationPreferences maps a stored row to the client shape', async () => {
  const { db } = fakeDb([prefsRow()]);
  const prefs = await getNotificationPreferences(db, USER);
  assert.deepEqual(prefs, { priceAlertsEnabled: true, emailAlerts: false, pushAlerts: true });
});

test('upsertNotificationPreferences writes only provided fields and upserts on user_id', async () => {
  const { db, calls } = fakeDb([prefsRow({ emailAlerts: true })]);
  const prefs = await upsertNotificationPreferences(db, USER, { emailAlerts: true });

  const insert = calls.find((c) => c.m === 'insert');
  assert.equal(insert?.args[0], notificationPreferences, 'insert targets notification_preferences');

  const values = calls.find((c) => c.m === 'values');
  const written = values?.args[0] as Record<string, unknown>;
  assert.equal(written.userId, USER, 'userId is server-derived onto the row');
  assert.equal(written.emailAlerts, true, 'provided field written');
  assert.ok(!('priceAlertsEnabled' in written), 'omitted field is not written');
  assert.ok(!('pushAlerts' in written), 'omitted field is not written');

  const conflict = calls.find((c) => c.m === 'onConflictDoUpdate');
  assert.ok(conflict, 'upsert on conflict');
  const cfg = conflict?.args[0] as { target?: unknown; set?: Record<string, unknown> };
  assert.equal(cfg.target, notificationPreferences.userId, 'conflict key is user_id');
  assert.equal(cfg.set?.emailAlerts, true, 'set carries only the provided field (+ updatedAt)');
  assert.ok(!('priceAlertsEnabled' in (cfg.set ?? {})), 'omitted field not in set');
  assert.ok(cfg.set?.updatedAt instanceof Date, 'updatedAt bumped');

  assert.deepEqual(prefs, { priceAlertsEnabled: true, emailAlerts: true, pushAlerts: true });
});

// --- in-app notifications ---------------------------------------------------

test('listInAppNotifications selects owner rows, newest-first, capped, ISO dates', async () => {
  const rows: InAppNotification[] = [
    notificationRow({ id: '22222222-2222-4222-8222-222222222222', createdAt: new Date('2026-07-05T00:00:00Z') }),
    notificationRow({
      id: '33333333-3333-4333-8333-333333333333',
      readAt: new Date('2026-07-04T12:00:00Z'),
      createdAt: new Date('2026-07-01T00:00:00Z'),
    }),
  ];
  const { db, calls } = fakeDb(rows);
  const result = await listInAppNotifications(db, USER);

  assert.equal(calls.find((c) => c.m === 'from')?.args[0], inAppNotifications);
  assert.ok(calls.find((c) => c.m === 'where'), 'feed is owner-scoped');
  assert.ok(calls.find((c) => c.m === 'orderBy'), 'feed is ordered');
  assert.equal(calls.find((c) => c.m === 'limit')?.args[0], 50, 'feed is capped at 50');

  assert.deepEqual(
    result.map((n) => n.id),
    ['22222222-2222-4222-8222-222222222222', '33333333-3333-4333-8333-333333333333'],
  );
  assert.equal(result[0]!.createdAt, '2026-07-05T00:00:00.000Z', 'createdAt serialized to ISO');
  assert.equal(result[0]!.readAt, null, 'unread → null');
  assert.equal(result[1]!.readAt, '2026-07-04T12:00:00.000Z', 'read → ISO');
  assert.deepEqual(result[0]!.payload, { productId: 'p-1', newPriceCents: 3900 });
});

test('findInAppNotification fetches by id so ownership can be verified before write', async () => {
  const { db, calls } = fakeDb([notificationRow({ userId: OTHER })]);
  const row = await findInAppNotification(db, '11111111-1111-4111-8111-111111111111');

  assert.equal(calls.find((c) => c.m === 'from')?.args[0], inAppNotifications);
  assert.ok(calls.find((c) => c.m === 'where'), 'fetched by id');
  // Returns the raw row (userId intact) so the route can call the authz guard.
  assert.equal(row?.userId, OTHER);
});

test('markInAppNotificationRead issues an owner-scoped update (id AND user_id)', async () => {
  const { db, calls } = fakeDb();
  await markInAppNotificationRead(db, USER, '11111111-1111-4111-8111-111111111111');

  assert.equal(calls.find((c) => c.m === 'update')?.args[0], inAppNotifications, 'update targets the table');
  const set = calls.find((c) => c.m === 'set')?.args[0] as { readAt?: unknown };
  assert.ok(set?.readAt instanceof Date, 'readAt stamped to now');
  const where = calls.find((c) => c.m === 'where');
  assert.ok(where && where.args[0] !== undefined, 'update is scoped (id + owner) — no cross-user mark-read');
});

// --- push tokens ------------------------------------------------------------

test('registerPushToken upserts idempotently on (user_id, token)', async () => {
  const { db, calls } = fakeDb();
  await registerPushToken(db, USER, 'expo-token-abc', 'ios');

  assert.equal(calls.find((c) => c.m === 'insert')?.args[0], pushTokens, 'insert targets push_tokens');
  const written = calls.find((c) => c.m === 'values')?.args[0] as Record<string, unknown>;
  assert.deepEqual(written, { userId: USER, token: 'expo-token-abc', platform: 'ios' });

  const conflict = calls.find((c) => c.m === 'onConflictDoNothing');
  assert.ok(conflict, 'onConflictDoNothing makes register idempotent');
  const cfg = conflict?.args[0] as { target?: unknown[] };
  assert.ok(Array.isArray(cfg.target) && cfg.target.length === 2);
  assert.equal(cfg.target![0], pushTokens.userId);
  assert.equal(cfg.target![1], pushTokens.token);
});

test('unregisterPushToken issues a scoped delete (owner + token)', async () => {
  const { db, calls } = fakeDb();
  await unregisterPushToken(db, USER, 'expo-token-abc');

  assert.equal(calls.find((c) => c.m === 'delete')?.args[0], pushTokens, 'delete targets push_tokens');
  const where = calls.find((c) => c.m === 'where');
  assert.ok(where && where.args[0] !== undefined, 'delete is owner + token scoped');
});
