/**
 * Unit tests for the inbound-receipt token service — no live DB. A chainable
 * Drizzle stand-in (mirroring notifications-server.test.ts) records every
 * query-builder call and resolves an await to the seeded rows, so we assert the
 * operation SHAPE and the pure token/address helpers:
 *   - mintTokenValue: lowercase hex, ≥ 24 chars (the webhook's token shape)
 *   - composeReceiptAddress: `u_<token>@<domain>`
 *   - getActiveToken: owner-scoped, active-only select
 *   - getOrCreateActiveToken: returns an existing token WITHOUT minting (mint-once
 *     — a second GET finds the row); mints + inserts when none is active
 *   - regenerateActiveToken: revokes active (stamps revoked_at) THEN mints a new
 *     token — the rotate order that keeps the active-user index satisfied
 *   - resolveToken: active → {active,userId}; revoked → {revoked}; missing → {unknown}
 *
 * Route auth (401/403 via requireUser + isSameOrigin + the @era/core guards) lives
 * in the route handlers and @era/core's authz tests.
 *
 * Run: node --experimental-strip-types --test apps/web/src/lib/receipt-inbox.test.ts
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { type DbClient, receiptInboxTokens } from '@era/db';

import {
  composeReceiptAddress,
  getActiveToken,
  getOrCreateActiveToken,
  mintTokenValue,
  regenerateActiveToken,
  resolveToken,
} from './receipt-inbox.ts';

/** One recorded query-builder call. */
interface Call {
  readonly m: string;
  readonly args: readonly unknown[];
}

/**
 * Chainable Drizzle stand-in: every method records its call and returns the same
 * thenable chain; awaiting the chain resolves to `rows`. Mirrors the fake in
 * notifications-server.test.ts / saved-products-server.test.ts.
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

// --- pure helpers -----------------------------------------------------------

test('mintTokenValue is lowercase hex and at least 24 chars', () => {
  for (let i = 0; i < 20; i += 1) {
    const token = mintTokenValue();
    assert.match(token, /^[a-f0-9]{24,}$/, 'lowercase hex, ≥ 24 chars');
    // Matches the webhook's recipient-token shape too.
    assert.match(`u_${token}`, /^u_([a-z0-9]{24,})$/i);
  }
});

test('mintTokenValue is unique across calls', () => {
  const seen = new Set<string>();
  for (let i = 0; i < 100; i += 1) seen.add(mintTokenValue());
  assert.equal(seen.size, 100);
});

test('composeReceiptAddress builds u_<token>@<domain>', () => {
  assert.equal(composeReceiptAddress('abc123', 'in.era.style'), 'u_abc123@in.era.style');
});

// --- getActiveToken ---------------------------------------------------------

test('getActiveToken selects owner-scoped, active-only', async () => {
  const { db, calls } = fakeDb([{ token: 'tok-1' }]);
  const row = await getActiveToken(db, USER);

  assert.equal(calls.find((c) => c.m === 'from')?.args[0], receiptInboxTokens);
  assert.ok(calls.find((c) => c.m === 'where'), 'scoped by user + revoked_at IS NULL');
  assert.equal(calls.find((c) => c.m === 'limit')?.args[0], 1);
  assert.deepEqual(row, { token: 'tok-1' });
});

// --- getOrCreateActiveToken (mint-once) -------------------------------------

test('getOrCreateActiveToken returns an existing token WITHOUT minting', async () => {
  const { db, calls } = fakeDb([{ token: 'existing-token' }]);
  const token = await getOrCreateActiveToken(db, USER);

  assert.equal(token, 'existing-token');
  assert.ok(!calls.find((c) => c.m === 'insert'), 'no insert when a token already exists');
});

test('getOrCreateActiveToken mints + inserts when none is active', async () => {
  const { db, calls } = fakeDb([]); // no active row
  const token = await getOrCreateActiveToken(db, USER);

  assert.match(token, /^[a-f0-9]{24,}$/);
  const insert = calls.find((c) => c.m === 'insert');
  assert.equal(insert?.args[0], receiptInboxTokens, 'insert targets receipt_inbox_tokens');
  const values = calls.find((c) => c.m === 'values');
  const written = values?.args[0] as Record<string, unknown>;
  assert.equal(written.userId, USER, 'userId server-derived onto the row');
  assert.equal(written.token, token, 'the bare minted token is stored (no u_ prefix)');
  assert.ok(!String(written.token).startsWith('u_'), 'stored token has no routing prefix');
});

// --- regenerateActiveToken (rotate) -----------------------------------------

test('regenerateActiveToken revokes the active token THEN mints a new one', async () => {
  const { db, calls } = fakeDb([]);
  const token = await regenerateActiveToken(db, USER);

  // The update (revoke) must precede the insert (mint) in call order.
  const updateIdx = calls.findIndex((c) => c.m === 'update');
  const insertIdx = calls.findIndex((c) => c.m === 'insert');
  assert.ok(updateIdx !== -1, 'revokes via update');
  assert.ok(insertIdx !== -1, 'mints via insert');
  assert.ok(updateIdx < insertIdx, 'revoke-before-mint keeps the active-user index satisfied');

  const set = calls.find((c) => c.m === 'set');
  const patch = set?.args[0] as Record<string, unknown>;
  assert.ok(patch.revokedAt instanceof Date, 'the old token is stamped revoked (hard kill)');

  const values = calls.find((c) => c.m === 'values');
  const written = values?.args[0] as Record<string, unknown>;
  assert.equal(written.userId, USER);
  assert.equal(written.token, token);
});

// --- resolveToken -----------------------------------------------------------

test('resolveToken → active for a live row', async () => {
  const { db } = fakeDb([{ userId: USER, revokedAt: null }]);
  assert.deepEqual(await resolveToken(db, 'tok'), { status: 'active', userId: USER });
});

test('resolveToken → revoked when the row is soft-killed', async () => {
  const { db } = fakeDb([{ userId: USER, revokedAt: new Date('2026-07-08T00:00:00Z') }]);
  assert.deepEqual(await resolveToken(db, 'tok'), { status: 'revoked' });
});

test('resolveToken → unknown when no row matches', async () => {
  const { db } = fakeDb([]);
  assert.deepEqual(await resolveToken(db, 'tok'), { status: 'unknown' });
});
