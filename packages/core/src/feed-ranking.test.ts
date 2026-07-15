/**
 * Unit tests for the v1 feed ranker (recency + follows + engagement).
 *
 * The ranker is pure and total, and `now` is injected — so every property here is
 * a fact about the score formula, asserted deterministically:
 *   score = 100·0.5^(ageHours/24) + (followed ? 40 : 0) + 10·ln(1 + likes + 2·saves)
 * ordered score desc → createdAt desc → postId desc.
 *
 * Run: node --experimental-strip-types --test src/feed-ranking.test.ts
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  createRecencyFollowsEngagementRanker,
  type FeedCandidate,
  type ViewerContext,
} from './feed-ranking.ts';

const ranker = createRecencyFollowsEngagementRanker();

/** Build a candidate with sensible defaults; override what a test cares about. */
function candidate(partial: Partial<FeedCandidate> & Pick<FeedCandidate, 'postId' | 'createdAt'>): FeedCandidate {
  return {
    creatorId: `creator-${partial.postId}`,
    likeCount: 0,
    saveCount: 0,
    isFollowedCreator: false,
    ...partial,
  };
}

/** A viewer context with an injected `now`. */
function ctx(now: string): ViewerContext {
  return { viewerId: 'viewer-1', now };
}

/** The post ids in ranked order — the thing most tests assert on. */
function order(candidates: readonly FeedCandidate[], now: string): string[] {
  return ranker.rank(candidates, ctx(now)).map((r) => r.candidate.postId);
}

/** Narrow away `undefined` from an indexed access (noUncheckedIndexedAccess). */
function present<T>(value: T | undefined, label: string): T {
  assert.ok(value !== undefined, `expected ${label} to be present`);
  return value;
}

const NOW = '2026-07-15T00:00:00.000Z';

// --- name -------------------------------------------------------------------

test('the ranker names itself so a swap is observable on the wire', () => {
  assert.equal(ranker.name, 'recency-follows-engagement-v1');
});

// --- determinism ------------------------------------------------------------

test('same input ranked twice yields an identical order', () => {
  const candidates = [
    candidate({ postId: 'a', createdAt: '2026-07-14T00:00:00.000Z', likeCount: 5, saveCount: 1 }),
    candidate({ postId: 'b', createdAt: '2026-07-13T00:00:00.000Z', isFollowedCreator: true }),
    candidate({ postId: 'c', createdAt: '2026-07-15T00:00:00.000Z', likeCount: 20 }),
  ];
  assert.deepEqual(order(candidates, NOW), order(candidates, NOW));
});

// --- recency ----------------------------------------------------------------

test('at equal engagement and follow, the fresher post wins', () => {
  const fresh = candidate({ postId: 'fresh', createdAt: '2026-07-15T00:00:00.000Z' });
  const old = candidate({ postId: 'old', createdAt: '2026-07-01T00:00:00.000Z' });
  assert.deepEqual(order([old, fresh], NOW), ['fresh', 'old']);
});

// --- follows ----------------------------------------------------------------

test('a followed fresh post (~140) beats a stranger fresh post (~100)', () => {
  const followed = candidate({ postId: 'followed', createdAt: NOW, isFollowedCreator: true });
  const stranger = candidate({ postId: 'stranger', createdAt: NOW });
  const ranked = ranker.rank([stranger, followed], ctx(NOW));
  assert.deepEqual(ranked.map((r) => r.candidate.postId), ['followed', 'stranger']);
  // The formula's headline numbers: a fresh followed post ~140, a fresh stranger ~100.
  const top = present(ranked[0], 'top');
  const second = present(ranked[1], 'second');
  assert.ok(Math.abs(top.score - 140) < 1e-9, `followed score ${top.score} ≈ 140`);
  assert.ok(Math.abs(second.score - 100) < 1e-9, `stranger score ${second.score} ≈ 100`);
});

// --- engagement: saves outweigh likes ---------------------------------------

test('a save is worth two likes — 2 saves beats 2 likes at equal recency', () => {
  const saves = candidate({ postId: 'saves', createdAt: NOW, saveCount: 2 });
  const likes = candidate({ postId: 'likes', createdAt: NOW, likeCount: 2 });
  assert.deepEqual(order([likes, saves], NOW), ['saves', 'likes']);
});

test('one save exactly equals two likes in the engagement term', () => {
  const oneSave = present(ranker.rank([candidate({ postId: 's', createdAt: NOW, saveCount: 1 })], ctx(NOW))[0], 'one-save result').score;
  const twoLikes = present(ranker.rank([candidate({ postId: 'l', createdAt: NOW, likeCount: 2 })], ctx(NOW))[0], 'two-likes result').score;
  assert.ok(Math.abs(oneSave - twoLikes) < 1e-9, `1 save (${oneSave}) === 2 likes (${twoLikes})`);
});

// --- engagement: ln damping -------------------------------------------------

test('ln damping: a 10k-like week-old post loses to today\'s followed post', () => {
  const viral = candidate({ postId: 'viral', createdAt: '2026-07-08T00:00:00.000Z', likeCount: 10_000 });
  const todayFollowed = candidate({ postId: 'today', createdAt: NOW, isFollowedCreator: true });
  assert.deepEqual(order([viral, todayFollowed], NOW), ['today', 'viral']);
});

// --- tie-break chain: score desc → createdAt desc → postId desc -------------

test('ties break by createdAt desc, then postId desc', () => {
  // All three are future-dated relative to `now`, so age clamps to 0 and every
  // recency term is 100 — zero engagement, no follow — giving three equal scores.
  const past = '2026-07-01T00:00:00.000Z';
  const later = candidate({ postId: 'p-a', createdAt: '2026-07-10T00:00:00.000Z' });
  const laterHigherId = candidate({ postId: 'p-z', createdAt: '2026-07-10T00:00:00.000Z' });
  const earlier = candidate({ postId: 'p-z', createdAt: '2026-07-05T00:00:00.000Z' });
  // createdAt desc puts the two 2026-07-10 posts first; between them postId desc
  // puts 'p-z' before 'p-a'. The 2026-07-05 post is last.
  assert.deepEqual(order([later, earlier, laterHigherId], past), ['p-z', 'p-a', 'p-z']);
});

// --- totality: empty, future-dated, injected now ----------------------------

test('an empty candidate list ranks to an empty list', () => {
  assert.deepEqual(ranker.rank([], ctx(NOW)), []);
});

test('a future-dated post (createdAt ahead of now) does not explode — age clamps to 0', () => {
  const future = candidate({ postId: 'future', createdAt: '2026-08-01T00:00:00.000Z' });
  const present = candidate({ postId: 'present', createdAt: NOW });
  const ranked = ranker.rank([future, present], ctx(NOW));
  // Both clamp to a 100 recency; the tie falls to createdAt desc, so the
  // future-dated post sorts first — and every score is finite.
  for (const r of ranked) {
    assert.ok(Number.isFinite(r.score), `score ${r.score} is finite`);
  }
  assert.deepEqual(ranked.map((r) => r.candidate.postId), ['future', 'present']);
});

test('the injected now is respected — the same candidates reorder as now advances', () => {
  // OLD carries steady engagement; NEW is fresher with none. Which wins depends
  // entirely on `now`, so the order must flip between the two clocks.
  const old = candidate({ postId: 'old', createdAt: '2026-07-01T00:00:00.000Z', likeCount: 1000 });
  const fresh = candidate({ postId: 'fresh', createdAt: '2026-07-08T00:00:00.000Z' });
  assert.deepEqual(order([old, fresh], '2026-07-08T00:00:00.000Z'), ['fresh', 'old']);
  assert.deepEqual(order([old, fresh], '2026-07-15T00:00:00.000Z'), ['old', 'fresh']);
});

test('rank never mutates the input array', () => {
  const candidates = [
    candidate({ postId: 'a', createdAt: '2026-07-01T00:00:00.000Z' }),
    candidate({ postId: 'b', createdAt: NOW }),
  ];
  const snapshot = candidates.map((c) => c.postId);
  ranker.rank(candidates, ctx(NOW));
  assert.deepEqual(candidates.map((c) => c.postId), snapshot);
});
