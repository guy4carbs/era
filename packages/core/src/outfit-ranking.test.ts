/**
 * Unit tests for the outfit-ranker seam (outfit-ranking.ts).
 *
 * The heuristic baseline is a stable, documented REFERENCE — so the facts asserted here
 * are about its score formula and its determinism/tie-break discipline, cloned from the
 * feed ranker's tests. This is the reference a learned ranker must beat; its exact quality
 * is not the point, its STABILITY is.
 *   score = 1·|itemIds| + 10·(features.affinity ?? 0)
 * ordered score desc → candidate key asc.
 *
 * Run: node --experimental-strip-types --test src/outfit-ranking.test.ts
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  createHeuristicOutfitRanker,
  type OutfitCandidate,
  type OutfitRankContext,
} from './outfit-ranking.ts';

const ranker = createHeuristicOutfitRanker();

const CTX: OutfitRankContext = { userId: 'user-1', now: 1_700_000_000_000 };

/** Build a candidate with sensible defaults; override what a test cares about. */
function candidate(partial: Partial<OutfitCandidate> & Pick<OutfitCandidate, 'itemIds'>): OutfitCandidate {
  return { ...partial };
}

/** The candidate identities in ranked order. */
function order(candidates: readonly OutfitCandidate[]): string[] {
  return ranker.rank(candidates, CTX).map((r) => r.candidate.outfitId ?? r.candidate.itemIds.join('+'));
}

test('the ranker names itself so a swap is observable on telemetry', () => {
  assert.equal(ranker.name, 'heuristic-baseline-v1');
});

test('same input ranked twice yields an identical order (deterministic)', () => {
  const candidates = [
    candidate({ outfitId: 'a', itemIds: ['i1', 'i2'] }),
    candidate({ outfitId: 'b', itemIds: ['i1', 'i2', 'i3'] }),
    candidate({ outfitId: 'c', itemIds: ['i1'], features: { affinity: 0.5 } }),
  ];
  assert.deepEqual(order(candidates), order(candidates));
});

test('a fuller look outscores a sparser one, all else equal', () => {
  const full = candidate({ outfitId: 'full', itemIds: ['i1', 'i2', 'i3'] });
  const sparse = candidate({ outfitId: 'sparse', itemIds: ['i1'] });
  assert.deepEqual(order([sparse, full]), ['full', 'sparse']);
});

test('the affinity feature moves the score: a high-affinity single item beats a bare pair', () => {
  // score(pair) = 2; score(single, affinity 0.5) = 1 + 10*0.5 = 6.
  const affinity = candidate({ outfitId: 'aff', itemIds: ['i1'], features: { affinity: 0.5 } });
  const pair = candidate({ outfitId: 'pair', itemIds: ['i1', 'i2'] });
  assert.deepEqual(order([pair, affinity]), ['aff', 'pair']);
});

test('a non-finite affinity floors to 0 rather than exploding the score', () => {
  const bad = candidate({ outfitId: 'bad', itemIds: ['i1'], features: { affinity: Number.NaN } });
  const ranked = ranker.rank([bad], CTX);
  assert.equal(ranked[0]?.score, 1); // 1 item, affinity floored to 0
  assert.ok(Number.isFinite(ranked[0]?.score ?? Number.NaN));
});

test('missing features degrade to a pure item-count score (never throws)', () => {
  const c = candidate({ outfitId: 'c', itemIds: ['i1', 'i2'] });
  assert.equal(ranker.rank([c], CTX)[0]?.score, 2);
});

test('ties break by candidate key ascending — total and stable', () => {
  // Two equal-scoring candidates (both 1 item, no affinity). Keys are id:x / id:y.
  const y = candidate({ outfitId: 'y', itemIds: ['i9'] });
  const x = candidate({ outfitId: 'x', itemIds: ['i9'] });
  assert.deepEqual(order([y, x]), ['x', 'y']);
});

test('an idless proposal keys on its sorted item ids for a stable tie-break', () => {
  // Same score (2 items each), no ids — keyed by sorted item ids: 'a,b' < 'c,d'.
  const first = candidate({ itemIds: ['b', 'a'] });
  const second = candidate({ itemIds: ['d', 'c'] });
  const ranked = ranker.rank([second, first], CTX);
  assert.deepEqual(ranked.map((r) => [...r.candidate.itemIds].sort().join(',')), ['a,b', 'c,d']);
});

test('an empty candidate list ranks to an empty list', () => {
  assert.deepEqual(ranker.rank([], CTX), []);
});

test('rank never mutates the input array', () => {
  const candidates = [
    candidate({ outfitId: 'a', itemIds: ['i1'] }),
    candidate({ outfitId: 'b', itemIds: ['i1', 'i2'] }),
  ];
  const snapshot = candidates.map((c) => c.outfitId);
  ranker.rank(candidates, CTX);
  assert.deepEqual(candidates.map((c) => c.outfitId), snapshot);
});
