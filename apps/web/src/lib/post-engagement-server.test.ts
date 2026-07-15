/**
 * Unit tests for the post-engagement server helpers — no live DB. Same chainable
 * Proxy fake as follows-server.test.ts. Covers the shared existence+block gate
 * (present / absent / blocked / anon), the idempotent like/save writes, the
 * scoped unlike/unsave deletes, and the live-count coercion.
 *
 * Run: node --experimental-strip-types --test apps/web/src/lib/post-engagement-server.test.ts
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { type DbClient, type FeedPost, feedPosts, postLikes, postSaves, userBlocks } from '@era/db';

import {
  countLikes,
  countSaves,
  likePost,
  loadPostForViewer,
  savePost,
  unlikePost,
  unsavePost,
} from './post-engagement-server.ts';

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

const POST: FeedPost = { id: 'p1', userId: 'creator', outfitId: 'o1', eraId: null, createdAt: new Date('2026-07-14T00:00:00.000Z') };

test('loadPostForViewer returns the post when it exists and no block edge exists', async () => {
  // #1 the post row; #2 the block check (empty → not blocked).
  const { db, calls } = fakeDb([[POST], []]);
  const post = await loadPostForViewer(db, 'p1', 'viewer');
  assert.deepEqual(post, POST);
  assert.equal(calls.find((c) => c.m === 'from')?.args[0], feedPosts, 'reads feed_posts first');
  assert.ok(calls.some((c) => c.args[0] === userBlocks), 'then applies the block gate');
});

test('loadPostForViewer returns null for an absent post WITHOUT a block query', async () => {
  const { db, calls } = fakeDb([[]]);
  assert.equal(await loadPostForViewer(db, 'missing', 'viewer'), null);
  assert.equal(calls.filter((c) => c.args[0] === userBlocks).length, 0, 'no block check when the post is absent');
});

test('loadPostForViewer returns null when the creator is blocked either way', async () => {
  // #1 the post; #2 the block check returns an edge → gated to null (indistinguishable from absent).
  const { db } = fakeDb([[POST], [{ blockerId: 'viewer' }]]);
  assert.equal(await loadPostForViewer(db, 'p1', 'viewer'), null);
});

test('loadPostForViewer runs no block query for an anonymous viewer', async () => {
  const { db, calls } = fakeDb([[POST]]);
  const post = await loadPostForViewer(db, 'p1', null);
  assert.deepEqual(post, POST);
  assert.equal(calls.filter((c) => c.args[0] === userBlocks).length, 0, 'anon viewer short-circuits the block check');
});

test('likePost / savePost insert idempotently via onConflictDoNothing', async () => {
  const like = fakeDb();
  await likePost(like.db, 'p1', 'viewer');
  assert.equal(like.calls.find((c) => c.m === 'insert')?.args[0], postLikes, 'like targets post_likes');
  assert.ok(like.calls.find((c) => c.m === 'onConflictDoNothing'), 'a repeat like is a no-op');

  const save = fakeDb();
  await savePost(save.db, 'p1', 'viewer');
  assert.equal(save.calls.find((c) => c.m === 'insert')?.args[0], postSaves, 'save targets post_saves');
  assert.ok(save.calls.find((c) => c.m === 'onConflictDoNothing'), 'a repeat save is a no-op');
});

test('unlikePost / unsavePost issue scoped deletes', async () => {
  const unlike = fakeDb();
  await unlikePost(unlike.db, 'p1', 'viewer');
  assert.equal(unlike.calls.find((c) => c.m === 'delete')?.args[0], postLikes);

  const unsave = fakeDb();
  await unsavePost(unsave.db, 'p1', 'viewer');
  assert.equal(unsave.calls.find((c) => c.m === 'delete')?.args[0], postSaves);
});

test('countLikes / countSaves coerce the aggregate and default empty → 0', async () => {
  const likes = fakeDb([[{ n: 7 }]]);
  assert.equal(await countLikes(likes.db, 'p1'), 7);
  assert.equal(likes.calls.find((c) => c.m === 'from')?.args[0], postLikes);

  const emptyLikes = fakeDb([[]]);
  assert.equal(await countLikes(emptyLikes.db, 'p1'), 0);

  const saves = fakeDb([[{ n: 2 }]]);
  assert.equal(await countSaves(saves.db, 'p1'), 2);
});
