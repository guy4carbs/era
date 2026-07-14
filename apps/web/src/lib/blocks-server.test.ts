/**
 * Unit tests for the block-graph server helpers — no live DB. A chainable fake
 * (the same Proxy stand-in as follows-server.test.ts) records every query-builder
 * call and dequeues a configured result set per awaited query, so we can assert
 * the operation shape: the both-directions block check, the anon short-circuit,
 * the invisibility set, the daily cap, and the insert-then-two-deletes ordering
 * that the no-transaction crash semantics depend on.
 *
 * Run: node --experimental-strip-types --test apps/web/src/lib/blocks-server.test.ts
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { type DbClient, follows, profiles, userBlocks } from '@era/db';

import {
  MAX_BLOCKS_PER_DAY,
  blockUser,
  blockedUserIdsFor,
  checkBlockLimit,
  isBlockedEitherWay,
  listBlocked,
  unblockUser,
} from './blocks-server.ts';

interface Call {
  readonly m: string;
  readonly args: readonly unknown[];
}

function fakeDb(resultSets: unknown[][] = []): { db: DbClient; calls: Call[] } {
  const calls: Call[] = [];
  const queue = [...resultSets];
  const chain: Record<string | symbol, unknown> = {
    then: (resolve: (rows: unknown[]) => unknown, reject: (e: unknown) => unknown) => {
      const rows = queue.length > 0 ? (queue.shift() as unknown[]) : [];
      return Promise.resolve(rows).then(resolve, reject);
    },
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

test('isBlockedEitherWay short-circuits to false for an anonymous target with NO query', async () => {
  const { db, calls } = fakeDb([[{ blockerId: 'x' }]]);
  assert.equal(await isBlockedEitherWay(db, 'viewer', null), false);
  assert.equal(calls.length, 0, 'a null counterparty issues no database query');
});

test('isBlockedEitherWay is true when an edge exists in either direction, false when absent', async () => {
  const present = fakeDb([[{ blockerId: 'a' }]]);
  assert.equal(await isBlockedEitherWay(present.db, 'a', 'b'), true);
  assert.equal(present.calls.find((c) => c.m === 'from')?.args[0], userBlocks, 'checks the user_blocks table');
  assert.ok(present.calls.find((c) => c.m === 'where'), 'a single where ORs both directed edges');

  const absent = fakeDb([[]]);
  assert.equal(await isBlockedEitherWay(absent.db, 'a', 'b'), false);
});

test('blockedUserIdsFor unions both directions into a set of the OTHER party', async () => {
  // viewer blocked u1; u2 blocked viewer. The set is {u1, u2}.
  const { db } = fakeDb([
    [
      { blockerId: 'viewer', blockedId: 'u1' },
      { blockerId: 'u2', blockedId: 'viewer' },
    ],
  ]);
  const ids = await blockedUserIdsFor(db, 'viewer');
  assert.deepEqual([...ids].sort(), ['u1', 'u2']);
});

test('blockedUserIdsFor is empty (no throw) when the viewer has no block edges', async () => {
  const { db } = fakeDb([[]]);
  const ids = await blockedUserIdsFor(db, 'viewer');
  assert.equal(ids.size, 0);
});

test('checkBlockLimit counts the caller\'s recent blocks, coercing empty → 0, and gates at the cap', async () => {
  const under = fakeDb([[{ n: 3 }]]);
  const check = await checkBlockLimit(under.db, 'blocker-1');
  assert.equal(check.used, 3);
  assert.equal(check.limit, MAX_BLOCKS_PER_DAY);
  assert.equal(check.allowed, true);
  assert.equal(under.calls.find((c) => c.m === 'from')?.args[0], userBlocks, 'counts over user_blocks');

  const empty = fakeDb([[]]);
  assert.equal((await checkBlockLimit(empty.db, 'b')).used, 0);

  const atCap = fakeDb([[{ n: MAX_BLOCKS_PER_DAY }]]);
  assert.equal((await checkBlockLimit(atCap.db, 'b')).allowed, false, 'at the cap is blocked');

  const overCap = fakeDb([[{ n: MAX_BLOCKS_PER_DAY + 10 }]]);
  assert.equal((await checkBlockLimit(overCap.db, 'b')).allowed, false, 'over the cap is blocked');
});

test('blockUser inserts the block FIRST, then deletes the follow edge in BOTH directions', async () => {
  const { db, calls } = fakeDb();
  await blockUser(db, 'blocker', 'blocked');

  const insertIdx = calls.findIndex((c) => c.m === 'insert');
  assert.ok(insertIdx >= 0, 'a block insert is issued');
  assert.equal(calls[insertIdx]!.args[0], userBlocks, 'insert targets user_blocks');
  assert.ok(
    calls.find((c) => c.m === 'onConflictDoNothing'),
    'onConflictDoNothing makes a re-block a no-op',
  );

  const deleteIdxs = calls.map((c, i) => (c.m === 'delete' ? i : -1)).filter((i) => i >= 0);
  assert.equal(deleteIdxs.length, 2, 'two follow-edge deletes (both directions)');
  for (const idx of deleteIdxs) {
    assert.equal(calls[idx]!.args[0], follows, 'each delete targets follows');
    // The stricter state (the block) is written before any delete — crash between
    // statements can only leave a stale follow, which the read filters mask.
    assert.ok(insertIdx < idx, 'the block insert precedes every follow-edge delete');
  }
});

test('unblockUser issues a scoped delete over user_blocks (no count consulted)', async () => {
  const { db, calls } = fakeDb();
  await unblockUser(db, 'blocker', 'blocked');

  const del = calls.find((c) => c.m === 'delete');
  assert.ok(del, 'a delete is issued');
  assert.equal(del!.args[0], userBlocks, 'delete targets user_blocks');
  assert.equal(calls.find((c) => c.m === 'select'), undefined, 'unblock reads no count — it is uncapped');
});

test('listBlocked joins the blocked profiles for the caller', async () => {
  const { db, calls } = fakeDb([
    [{ username: 'jules', displayName: 'Jules', avatarUrl: null }],
  ]);
  const rows = await listBlocked(db, 'viewer');
  assert.deepEqual(rows, [{ username: 'jules', displayName: 'Jules', avatarUrl: null }]);
  assert.equal(calls.find((c) => c.m === 'from')?.args[0], userBlocks, 'lists from user_blocks');
  assert.equal(calls.find((c) => c.m === 'innerJoin')?.args[0], profiles, 'joins the blocked profile');
});
