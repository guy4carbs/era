/**
 * Unit tests for the feed post write helpers — no live DB. Same chainable Proxy
 * fake as follows-server.test.ts: records builder calls, dequeues a result set per
 * awaited query. Covers the daily cap, ownership scoping, the idempotent
 * share (insert-onConflict → returning, else select the live post), the scoped
 * unshare, and the lite projection's type derivation.
 *
 * Run: node --experimental-strip-types --test apps/web/src/lib/posts-server.test.ts
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { type DbClient, type FeedPost, eras, feedPosts, outfits } from '@era/db';

import {
  MAX_POSTS_PER_DAY,
  checkPostLimit,
  ownsEra,
  ownsOutfit,
  sharePost,
  toFeedPostLite,
  unsharePost,
} from './posts-server.ts';

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

test('checkPostLimit counts the caller\'s recent posts, coercing empty → 0, and gates at the cap', async () => {
  const under = fakeDb([[{ n: 5 }]]);
  const check = await checkPostLimit(under.db, 'user-1');
  assert.equal(check.used, 5);
  assert.equal(check.limit, MAX_POSTS_PER_DAY);
  assert.equal(check.allowed, true);
  assert.equal(under.calls.find((c) => c.m === 'from')?.args[0], feedPosts, 'counts over feed_posts');

  const empty = fakeDb([[]]);
  assert.equal((await checkPostLimit(empty.db, 'u')).used, 0);

  const atCap = fakeDb([[{ n: MAX_POSTS_PER_DAY }]]);
  assert.equal((await checkPostLimit(atCap.db, 'u')).allowed, false, 'at the cap is blocked');

  const overCap = fakeDb([[{ n: MAX_POSTS_PER_DAY + 1 }]]);
  assert.equal((await checkPostLimit(overCap.db, 'u')).allowed, false, 'over the cap is blocked');
});

test('ownsOutfit / ownsEra are true only when the subject row matches owner + id', async () => {
  const owned = fakeDb([[{ id: 'o1' }]]);
  assert.equal(await ownsOutfit(owned.db, 'user-1', 'o1'), true);
  assert.equal(owned.calls.find((c) => c.m === 'from')?.args[0], outfits, 'scopes over outfits');

  const notOwned = fakeDb([[]]);
  assert.equal(await ownsOutfit(notOwned.db, 'user-1', 'o1'), false, 'missing/foreign → false');

  const ownedEra = fakeDb([[{ id: 'e1' }]]);
  assert.equal(await ownsEra(ownedEra.db, 'user-1', 'e1'), true);
  assert.equal(ownedEra.calls.find((c) => c.m === 'from')?.args[0], eras, 'scopes over eras');
});

test('sharePost inserts with onConflictDoNothing + returning, and returns the fresh post', async () => {
  const fresh: FeedPost = {
    id: 'p1',
    userId: 'user-1',
    outfitId: 'o1',
    eraId: null,
    createdAt: new Date('2026-07-14T00:00:00.000Z'),
  };
  const { db, calls } = fakeDb([[fresh]]);
  const post = await sharePost(db, 'user-1', { outfitId: 'o1' });
  assert.deepEqual(post, fresh);

  assert.equal(calls.find((c) => c.m === 'insert')?.args[0], feedPosts, 'insert targets feed_posts');
  assert.deepEqual(calls.find((c) => c.m === 'values')?.args[0], { userId: 'user-1', outfitId: 'o1', eraId: null });
  assert.ok(calls.find((c) => c.m === 'onConflictDoNothing'), 'the partial-unique conflict is a no-op');
  assert.ok(calls.find((c) => c.m === 'returning'), 'returning yields the inserted row');
  assert.equal(calls.find((c) => c.m === 'select'), undefined, 'no follow-up select when the insert wrote a row');
});

test('sharePost returns the EXISTING live post idempotently when the insert conflicts', async () => {
  const existing: FeedPost = {
    id: 'p-existing',
    userId: 'user-1',
    outfitId: null,
    eraId: 'e1',
    createdAt: new Date('2026-07-10T00:00:00.000Z'),
  };
  // Insert writes nothing (conflict → empty returning), then the select finds the live post.
  const { db, calls } = fakeDb([[], [existing]]);
  const post = await sharePost(db, 'user-1', { eraId: 'e1' });
  assert.deepEqual(post, existing, 'the pre-existing post is returned, not a duplicate');
  assert.ok(calls.find((c) => c.m === 'select'), 'a select recovers the conflicting live post');
});

test('unsharePost issues a scoped owner+id delete (idempotent, uncapped)', async () => {
  const { db, calls } = fakeDb();
  await unsharePost(db, 'user-1', 'p1');
  const del = calls.find((c) => c.m === 'delete');
  assert.ok(del, 'a delete is issued');
  assert.equal(del!.args[0], feedPosts, 'delete targets feed_posts');
  assert.equal(calls.find((c) => c.m === 'select'), undefined, 'unshare consults no count');
});

test('toFeedPostLite derives type from the subject column and serializes createdAt', () => {
  const outfitPost: FeedPost = { id: 'p1', userId: 'u', outfitId: 'o1', eraId: null, createdAt: new Date('2026-07-14T12:00:00.000Z') };
  assert.deepEqual(toFeedPostLite(outfitPost), { id: 'p1', type: 'outfit', createdAt: '2026-07-14T12:00:00.000Z' });

  const eraPost: FeedPost = { id: 'p2', userId: 'u', outfitId: null, eraId: 'e1', createdAt: new Date('2026-07-14T12:00:00.000Z') };
  assert.equal(toFeedPostLite(eraPost).type, 'era');
});
