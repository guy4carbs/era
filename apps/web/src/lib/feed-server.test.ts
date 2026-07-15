/**
 * Unit tests for the feed-server read model — no live DB. The chainable Proxy fake
 * (as in follows-server.test.ts) records builder calls and dequeues a result set
 * per awaited query; a hand-built StorageClient stub with only `config.publicUrls`
 * lets us assert the cover is resolved on the PUBLIC path (owner isPrivate:false).
 *
 * Coverage: cursor round-trip + strict rejection; the candidate filters
 * (own-posts + block NOT EXISTS always; keyset only with a cursor); the six-query
 * bound (N+1 guard) with count coercion and viewer-state wiring; the deliberate
 * cover privacy override; the ranker name echo; and the stream-order nextCursor
 * (null on a short page, the last stream row on a full window).
 *
 * Run: node --experimental-strip-types --test apps/web/src/lib/feed-server.test.ts
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { type StorageClient } from '@era/core';
import { FEED_PAGE_WINDOW } from '@era/core/feed';
import { type DbClient, feedPosts } from '@era/db';

import { feedCandidateFilters, loadFeedPage, parseCursor, serializeCursor } from './feed-server.ts';

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

/** A storage stub that resolves ONLY the public-URL path (owner isPrivate:false). */
const CDN = 'https://cdn.test';
const storage = {
  config: { publicUrls: { 'items-cutout': `${CDN}/items`, 'outfit-covers': `${CDN}/covers` } },
} as unknown as StorageClient;

// ── Cursor ───────────────────────────────────────────────────────────────────

test('serializeCursor / parseCursor round-trip a (createdAt, id) pair', () => {
  const createdAt = new Date('2026-07-14T09:30:00.000Z');
  const id = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
  const cursor = serializeCursor(createdAt, id);
  assert.equal(cursor, `2026-07-14T09:30:00.000Z|${id}`);

  const parsed = parseCursor(cursor);
  assert.deepEqual(parsed, { createdAtISO: '2026-07-14T09:30:00.000Z', id });
});

test('parseCursor rejects garbage → null (no silent page-from-top)', () => {
  assert.equal(parseCursor(''), null, 'empty');
  assert.equal(parseCursor('nonsense'), null, 'no delimiter');
  assert.equal(parseCursor('2026-07-14T09:30:00.000Z'), null, 'missing id half');
  assert.equal(parseCursor('a|b|c'), null, 'too many parts');
  assert.equal(parseCursor('not-a-date|aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'), null, 'bad date');
  assert.equal(parseCursor('2026-07-14T09:30:00.000Z|not-a-uuid'), null, 'bad id');
  // A non-canonical spelling of the instant must not round-trip.
  assert.equal(parseCursor('2026-07-14T09:30:00+00:00|aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'), null, 'non-canonical date');
});

// ── Candidate filters ─────────────────────────────────────────────────────────

test('feedCandidateFilters always excludes own-posts + blocks, and adds the keyset ONLY with a cursor', () => {
  const noCursor = feedCandidateFilters('viewer', null);
  assert.equal(noCursor.length, 2, 'page 1: own-posts exclusion + bidirectional block filter');
  for (const f of noCursor) {
    assert.ok(f !== undefined && f !== null, 'each filter is a real SQL condition');
  }

  const cursor = parseCursor(serializeCursor(new Date('2026-07-14T00:00:00.000Z'), 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'));
  const withCursor = feedCandidateFilters('viewer', cursor);
  assert.equal(withCursor.length, 3, 'a cursor adds the keyset bound');
});

// ── loadFeedPage integration ───────────────────────────────────────────────────

function candidateRow(over: Partial<Record<string, unknown>>): Record<string, unknown> {
  return {
    id: 'p',
    creatorId: 'creator',
    createdAt: new Date('2026-07-14T00:00:00.000Z'),
    outfitId: null,
    eraId: null,
    outfitName: null,
    outfitCover: null,
    eraTitle: null,
    eraCover: null,
    username: 'user',
    displayName: null,
    avatarUrl: null,
    ...over,
  };
}

test('loadFeedPage assembles payloads in ranked order with exactly six queries', async () => {
  const now = new Date('2026-07-14T00:00:00.000Z');
  const rowA = candidateRow({
    id: 'p-a',
    creatorId: 'creator-1',
    createdAt: now, // brand new → tops recency
    outfitId: 'o1',
    outfitName: 'Look A',
    outfitCover: 'creator-1/a.png',
    username: 'alice',
    displayName: 'Alice',
  });
  const rowB = candidateRow({
    id: 'p-b',
    creatorId: 'creator-2',
    createdAt: new Date('2026-07-12T00:00:00.000Z'), // 48h old
    eraId: 'e1',
    eraTitle: 'Era B',
    eraCover: 'creator-2/b.png',
    username: 'bob',
  });

  const { db, calls } = fakeDb([
    [rowA, rowB], // 1) candidates (stream order)
    [{ postId: 'p-a', n: 3 }], // 2) like counts (p-b: 0)
    [{ postId: 'p-a', n: 1 }], // 3) save counts
    [{ postId: 'p-a' }], // 4) viewer likes
    [], // 5) viewer saves
    [{ followeeId: 'creator-2' }], // 6) viewer follows
  ]);

  const page = await loadFeedPage(db, storage, 'viewer', null, now);

  // N+1 guard: exactly six queries, each issuing one `.from`.
  assert.equal(calls.filter((c) => c.m === 'from').length, 6, 'exactly six batched queries per page');
  assert.equal(calls.find((c) => c.m === 'from')?.args[0], feedPosts, 'the candidate query reads feed_posts');
  assert.ok(calls.find((c) => c.m === 'where'), 'the candidate query is filtered');
  assert.ok(calls.find((c) => c.m === 'orderBy'), 'ordered by the keyset index');
  assert.equal(calls.find((c) => c.m === 'limit')?.args[0], FEED_PAGE_WINDOW, 'limited to the page window');

  assert.equal(page.ranker, 'recency-follows-engagement-v1', 'the response echoes the ranker name');
  assert.equal(page.nextCursor, null, 'a short page (< window) exhausts the stream → null cursor');
  assert.equal(page.posts.length, 2);

  // Fresh, engaged post ranks above the older followed one here.
  const [first, second] = page.posts;
  assert.equal(first!.id, 'p-a');
  assert.equal(first!.type, 'outfit');
  assert.equal(first!.title, 'Look A');
  assert.equal(first!.likeCount, 3);
  assert.equal(first!.saveCount, 1);
  assert.deepEqual(first!.viewer, { liked: true, saved: false, following: false });
  assert.deepEqual(first!.creator, { username: 'alice', displayName: 'Alice', avatarUrl: null });
  // THE cover privacy override: resolved on the PUBLIC path (owner isPrivate:false).
  assert.equal(first!.coverUrl, `${CDN}/covers/creator-1/a.png`);

  assert.equal(second!.id, 'p-b');
  assert.equal(second!.type, 'era');
  assert.equal(second!.title, 'Era B');
  assert.equal(second!.likeCount, 0, 'a post absent from the count roll-up coerces to 0');
  assert.equal(second!.saveCount, 0);
  assert.deepEqual(second!.viewer, { liked: false, saved: false, following: true });
  assert.equal(second!.coverUrl, `${CDN}/covers/creator-2/b.png`);
});

test('loadFeedPage short-circuits an empty page to a single query and null cursor', async () => {
  const { db, calls } = fakeDb([[]]);
  const page = await loadFeedPage(db, storage, 'viewer', null, new Date());
  assert.deepEqual(page.posts, []);
  assert.equal(page.nextCursor, null);
  assert.equal(page.ranker, 'recency-follows-engagement-v1');
  assert.equal(calls.filter((c) => c.m === 'from').length, 1, 'no count/viewer queries on an empty page');
});

test('loadFeedPage emits a stream-order nextCursor when the window is full', async () => {
  const rows = Array.from({ length: FEED_PAGE_WINDOW }, (_, i) =>
    candidateRow({
      id: `p-${String(i).padStart(2, '0')}`,
      creatorId: `creator-${i}`,
      createdAt: new Date(Date.parse('2026-07-14T00:00:00.000Z') - i * 60_000),
      outfitId: `o-${i}`,
      outfitName: `Look ${i}`,
    }),
  );
  const last = rows[rows.length - 1]!;

  const { db } = fakeDb([rows, [], [], [], [], []]);
  const page = await loadFeedPage(db, storage, 'viewer', null, new Date('2026-07-14T00:00:00.000Z'));

  assert.equal(page.posts.length, FEED_PAGE_WINDOW);
  assert.equal(
    page.nextCursor,
    serializeCursor(last.createdAt as Date, last.id as string),
    'a full window yields the LAST STREAM row as the next cursor (not the last ranked row)',
  );
});
