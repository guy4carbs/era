/**
 * Unit tests for the follow-graph server helpers — no live DB. A chainable fake
 * records every query-builder call and dequeues a configured result set per
 * awaited query (mirroring wear-logs-server.test.ts's stand-in), so we can assert
 * the operation shape: idempotent insert, scoped delete, live counts, and the
 * anonymous-viewer short-circuit.
 *
 * Route auth (401/403 via requireUser + isSameOrigin + canInsertFollow) is
 * covered by @era/core's authz tests and the route; these cover the DB pieces
 * the route and the profile loader lean on.
 *
 * Run: node --experimental-strip-types --test apps/web/src/lib/follows-server.test.ts
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { type DbClient, follows, profiles } from '@era/db';

import {
  MAX_FOLLOWS_PER_DAY,
  checkFollowLimit,
  countFollowers,
  countFollowing,
  followUser,
  isFollowing,
  resolveUserIdByUsername,
  unfollowUser,
} from './follows-server.ts';

/** One recorded query-builder call. */
interface Call {
  readonly m: string;
  readonly args: readonly unknown[];
}

/**
 * Chainable Drizzle stand-in: every method records its call and returns the same
 * thenable chain; awaiting the chain dequeues the next configured result set (or
 * `[]` when exhausted).
 */
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

test('resolveUserIdByUsername returns the owning user id, or null when absent', async () => {
  const hit = fakeDb([[{ userId: 'owner-1' }]]);
  assert.equal(await resolveUserIdByUsername(hit.db, 'jules'), 'owner-1');
  assert.equal(hit.calls.find((c) => c.m === 'from')?.args[0], profiles, 'looks up the profiles table');

  const miss = fakeDb([[]]);
  assert.equal(await resolveUserIdByUsername(miss.db, 'ghost'), null);
});

test('countFollowers / countFollowing coerce the aggregate and scope on the right column', async () => {
  const followers = fakeDb([[{ n: 5 }]]);
  assert.equal(await countFollowers(followers.db, 'owner-1'), 5);
  assert.equal(followers.calls.find((c) => c.m === 'from')?.args[0], follows);
  assert.ok(followers.calls.find((c) => c.m === 'where'), 'followers are counted with a where clause');

  const following = fakeDb([[{ n: 2 }]]);
  assert.equal(await countFollowing(following.db, 'owner-1'), 2);

  // An empty aggregate coerces to 0, never NaN/undefined.
  const empty = fakeDb([[]]);
  assert.equal(await countFollowers(empty.db, 'owner-1'), 0);
});

test('isFollowing short-circuits to false for an anonymous viewer with NO query', async () => {
  const { db, calls } = fakeDb([[{ followerId: 'v' }]]);
  assert.equal(await isFollowing(db, null, 'owner-1'), false);
  assert.equal(calls.length, 0, 'anonymous viewer issues no database query');
});

test('isFollowing returns true when the edge exists, false when it does not', async () => {
  const present = fakeDb([[{ followerId: 'v' }]]);
  assert.equal(await isFollowing(present.db, 'v', 'owner-1'), true);
  assert.equal(present.calls.find((c) => c.m === 'from')?.args[0], follows);

  const absent = fakeDb([[]]);
  assert.equal(await isFollowing(absent.db, 'v', 'owner-1'), false);
});

test('followUser inserts the edge idempotently via onConflictDoNothing', async () => {
  const { db, calls } = fakeDb();
  await followUser(db, 'follower-1', 'followee-2');

  const insert = calls.find((c) => c.m === 'insert');
  assert.ok(insert, 'an insert is issued');
  assert.equal(insert!.args[0], follows, 'insert targets follows');

  const values = calls.find((c) => c.m === 'values');
  assert.deepEqual(values!.args[0], { followerId: 'follower-1', followeeId: 'followee-2' });

  assert.ok(
    calls.find((c) => c.m === 'onConflictDoNothing'),
    'onConflictDoNothing makes the re-follow a no-op',
  );
});

test('unfollowUser issues a scoped delete (no-op when the edge is absent)', async () => {
  const { db, calls } = fakeDb();
  await unfollowUser(db, 'follower-1', 'followee-2');

  const del = calls.find((c) => c.m === 'delete');
  assert.ok(del, 'a delete is issued');
  assert.equal(del!.args[0], follows, 'delete targets follows');
  assert.ok(calls.find((c) => c.m === 'where')?.args[0] !== undefined, 'delete is scoped (follower + followee)');

  // The cap gates POST only: unfollow consults no count, so it can never 429.
  assert.equal(
    calls.find((c) => c.m === 'select'),
    undefined,
    'unfollow reads no follow count — the daily cap does not apply to it',
  );
});

test('checkFollowLimit counts the caller\'s recent follows over the follows table, coercing empty → 0', async () => {
  const under = fakeDb([[{ n: 3 }]]);
  const check = await checkFollowLimit(under.db, 'follower-1');
  assert.equal(check.used, 3);
  assert.equal(check.limit, MAX_FOLLOWS_PER_DAY);
  assert.equal(under.calls.find((c) => c.m === 'from')?.args[0], follows, 'counts over the follows table');
  assert.ok(under.calls.find((c) => c.m === 'where'), 'scoped by a where clause (follower + created_at window)');

  // An empty aggregate coerces to 0 used, never NaN/undefined → allowed.
  const empty = fakeDb([[]]);
  const emptyCheck = await checkFollowLimit(empty.db, 'follower-1');
  assert.equal(emptyCheck.used, 0);
  assert.equal(emptyCheck.allowed, true);
});

test('checkFollowLimit allows under the cap and rejects at/over it', async () => {
  // One below the cap → the follow proceeds (POST inserts the edge).
  const underCap = fakeDb([[{ n: MAX_FOLLOWS_PER_DAY - 1 }]]);
  assert.equal((await checkFollowLimit(underCap.db, 'u')).allowed, true, 'under the cap proceeds');

  // Exactly at the cap → rejected before the insert (POST returns 429, no write).
  const atCap = fakeDb([[{ n: MAX_FOLLOWS_PER_DAY }]]);
  assert.equal((await checkFollowLimit(atCap.db, 'u')).allowed, false, 'at the cap is blocked');

  // Over the cap (e.g. a tuned-down limit or a race) → also rejected.
  const overCap = fakeDb([[{ n: MAX_FOLLOWS_PER_DAY + 5 }]]);
  assert.equal((await checkFollowLimit(overCap.db, 'u')).allowed, false, 'over the cap is blocked');
});
