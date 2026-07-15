/**
 * Unit tests for the public-profile loader — no live DB or R2. A chainable fake
 * db dequeues a configured result set per awaited query (in the loader's source
 * order; see the module doc), and a fake storage client carries only the public
 * base URLs (a public owner's cutouts/covers resolve to unsigned public URLs, so
 * getAssetUrl never touches S3). We assert every branch of the discriminated
 * union, the viewer-aware follow flag, cutout-only imagery, the item cap, and the
 * empty-eras roll-up short-circuit.
 *
 * Run: node --experimental-strip-types --test apps/web/src/lib/public-profile-server.test.ts
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { type StorageClient } from '@era/core';
import { type DbClient } from '@era/db';

import { loadPublicProfile } from './public-profile-server.ts';

/** One recorded query-builder call. */
interface Call {
  readonly m: string;
  readonly args: readonly unknown[];
}

/** Queue-driven Drizzle stand-in (mirrors follows-server.test.ts). */
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

/** Fake storage: only the public base URLs matter for a public owner's assets. */
const storage = {
  s3: {} as never,
  config: {
    accountId: 'acc',
    accessKeyId: 'ak',
    secretAccessKey: 'sk',
    buckets: { 'items-raw': 'raw', 'items-cutout': 'cut', 'outfit-covers': 'cov', avatars: 'av' },
    publicUrls: { 'items-cutout': 'https://cdn.example/cut', 'outfit-covers': 'https://cdn.example/cov' },
  },
} as unknown as StorageClient;

const OWNER = 'owner-1';
/** profiles.createdAt is a Date; the loader exposes it as an ISO 8601 string. */
const CREATED = new Date('2026-01-15T12:00:00.000Z');
const CREATED_ISO = '2026-01-15T12:00:00.000Z';

test('reserved username resolves to not_found WITHOUT any query', async () => {
  const { db, calls } = fakeDb();
  const result = await loadPublicProfile(db, storage, 'admin', null);
  assert.equal(result.state, 'not_found');
  assert.equal(calls.length, 0, 'a reserved name is rejected before touching the db');
});

test('an unknown username resolves to not_found', async () => {
  const { db } = fakeDb([[]]); // profile lookup misses
  const result = await loadPublicProfile(db, storage, 'ghost', null);
  assert.equal(result.state, 'not_found');
});

test('a private profile returns the minimal card with follower count, no content', async () => {
  const { db } = fakeDb([
    [
      {
        userId: OWNER,
        username: 'sara',
        displayName: 'Sara',
        avatarUrl: 'https://a/av.png',
        createdAt: CREATED,
        isPrivate: true,
      },
    ],
    [{ n: 7 }], // countFollowers
    // anonymous viewer → isFollowing short-circuits, no query
  ]);
  const result = await loadPublicProfile(db, storage, 'sara', null);
  assert.equal(result.state, 'private');
  if (result.state !== 'private') return;
  assert.deepEqual(result.profile, {
    username: 'sara',
    displayName: 'Sara',
    avatarUrl: 'https://a/av.png',
    createdAt: CREATED_ISO,
  });
  assert.equal(result.followerCount, 7);
  assert.equal(result.isFollowing, false);
  assert.ok(!('items' in result), 'a private card exposes no wardrobe content');
});

test('a private profile reflects the viewer follow edge when the viewer follows', async () => {
  const { db } = fakeDb([
    [{ userId: OWNER, username: 'sara', displayName: 'Sara', avatarUrl: null, createdAt: CREATED, isPrivate: true }],
    [], // isBlockedEitherWay → not blocked (viewer non-null → one block query)
    [{ n: 7 }], // countFollowers
    [{ followerId: 'viewer-2' }], // isFollowing → true
  ]);
  const result = await loadPublicProfile(db, storage, 'sara', 'viewer-2');
  assert.equal(result.state, 'private');
  if (result.state !== 'private') return;
  assert.equal(result.isFollowing, true);
});

test('a public profile returns full content: cutout imagery, counts, eras, outfits', async () => {
  const { db, calls } = fakeDb([
    [{ userId: OWNER, username: 'jules', displayName: 'Jules', avatarUrl: null, createdAt: CREATED, isPrivate: false }], // profile
    [], // isBlockedEitherWay → not blocked (viewer non-null → one block query)
    [{ n: 5 }], // countFollowers
    [{ followerId: 'viewer-2' }], // isFollowing → true
    [{ n: 2 }], // countFollowing
    [{ n: 3 }], // publicItemCount (total, > returned page)
    [
      { id: 'i1', name: 'Coat', category: 'outerwear', color: 'camel', imageCutoutPath: `${OWNER}/c1.png` },
      { id: 'i2', name: 'Tee', category: 'top', color: null, imageCutoutPath: null },
    ], // items page (cap not hit)
    [{ id: 'e1', title: 'Summer', coverImagePath: `${OWNER}/e1.jpg` }], // eras
    [{ eraId: 'e1', n: 4 }], // era→outfitCount roll-up
    [{ id: 'o1', name: 'Brunch', coverImagePath: null }], // outfits
  ]);

  const result = await loadPublicProfile(db, storage, 'jules', 'viewer-2');
  assert.equal(result.state, 'public');
  if (result.state !== 'public') return;

  assert.deepEqual(result.profile, {
    username: 'jules',
    displayName: 'Jules',
    avatarUrl: null,
    createdAt: CREATED_ISO,
  });
  assert.equal(result.followerCount, 5);
  assert.equal(result.followingCount, 2);
  assert.equal(result.isFollowing, true);
  assert.equal(result.publicItemCount, 3);

  // Cutout resolves to the public base URL; a cutout-less item exposes no image
  // (the raw bucket is never presigned for a stranger).
  assert.equal(result.items.length, 2);
  assert.deepEqual(result.items[0], {
    id: 'i1',
    name: 'Coat',
    category: 'outerwear',
    color: 'camel',
    imageUrl: 'https://cdn.example/cut/owner-1/c1.png',
  });
  assert.equal(result.items[1]!.imageUrl, null);

  assert.deepEqual(result.eras, [
    { id: 'e1', title: 'Summer', coverUrl: 'https://cdn.example/cov/owner-1/e1.jpg', outfitCount: 4 },
  ]);
  assert.deepEqual(result.outfits, [{ id: 'o1', name: 'Brunch', coverUrl: null }]);

  // The item page is capped at 60 newest (a limit(60) is issued alongside limit(1)).
  assert.ok(
    calls.some((c) => c.m === 'limit' && c.args[0] === 60),
    'the item page is capped',
  );
});

test('a public profile with no eras skips the roll-up query and returns empty grids', async () => {
  const { db } = fakeDb([
    [{ userId: OWNER, username: 'jules', displayName: null, avatarUrl: null, createdAt: CREATED, isPrivate: false }], // profile
    [{ n: 0 }], // countFollowers
    // anonymous viewer → no isFollowing query
    [{ n: 0 }], // countFollowing
    [{ n: 0 }], // publicItemCount
    [], // items
    [], // eras (empty → the era-count roll-up is skipped)
    [], // outfits
  ]);

  const result = await loadPublicProfile(db, storage, 'jules', null);
  assert.equal(result.state, 'public');
  if (result.state !== 'public') return;
  assert.deepEqual(result.items, []);
  assert.deepEqual(result.eras, []);
  assert.deepEqual(result.outfits, []);
  assert.equal(result.isFollowing, false);
  assert.equal(result.publicItemCount, 0);
});

test('a viewer blocked either direction sees not_found — indistinguishable from a missing profile', async () => {
  // The block check (query #2) finds an edge → not_found, and NO content queries
  // run (a blocked profile leaks nothing, not even existence).
  const { db, calls } = fakeDb([
    [{ userId: OWNER, username: 'jules', displayName: 'Jules', avatarUrl: null, createdAt: CREATED, isPrivate: false }],
    [{ blockerId: 'viewer-2' }], // isBlockedEitherWay → blocked
  ]);
  const result = await loadPublicProfile(db, storage, 'jules', 'viewer-2');
  assert.equal(result.state, 'not_found');
  // Only the profile lookup + the block check ran — no followers/items/eras/outfits.
  assert.equal(calls.filter((c) => c.m === 'from').length, 2, 'no content is loaded for a blocked pair');
});

test('an anonymous viewer runs NO block query (anon is never blocked)', async () => {
  const { db } = fakeDb([
    [{ userId: OWNER, username: 'jules', displayName: null, avatarUrl: null, createdAt: CREATED, isPrivate: true }],
    [{ n: 3 }], // countFollowers (no block query precedes it for an anon viewer)
  ]);
  const result = await loadPublicProfile(db, storage, 'jules', null);
  assert.equal(result.state, 'private');
  if (result.state !== 'private') return;
  assert.equal(result.followerCount, 3, 'the follower count reads correctly with no block query shifting the queue');
});
