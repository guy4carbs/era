/**
 * Unit tests for the offline eval harness (model-eval.ts) — the "measured wins" gate.
 *
 * Coverage: the deterministic split (reproducible, seed-sensitive, ratio edges), tagger
 * per-field accuracy (headline category + nullable-field support + name-skipped +
 * abstention-as-miss), ranker pairwise accuracy + accept-rate@1 (incl. ties = 0.5), and
 * the promotion verdict across every branch — win, tie, loss, insufficient-data, and
 * EXACTLY at the threshold.
 *
 * Run: node --experimental-strip-types --test src/model-eval.test.ts
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  DEFAULT_MIN_MARGIN,
  DEFAULT_MIN_TEST_COUNT,
  evaluateRanker,
  evaluateTagger,
  promotionVerdict,
  runTagger,
  splitHeldOut,
  type AcceptRejectExample,
  type TagCorrectionExample,
  type TagScoredPair,
  type VerdictMetric,
} from './model-eval.ts';
import { createDeterministicTaggingProvider, type TagPrediction } from './tagging.ts';
import {
  createHeuristicOutfitRanker,
  type OutfitCandidate,
  type OutfitRankContext,
} from './outfit-ranking.ts';

// -----------------------------------------------------------------------------
// splitHeldOut — deterministic, seed-sensitive, ratio edges.
// -----------------------------------------------------------------------------

const CORPUS = Array.from({ length: 200 }, (_, i) => i);

test('splitHeldOut is reproducible: same corpus + seed yields the same split', () => {
  const a = splitHeldOut(CORPUS, 0.3, 'seed-1');
  const b = splitHeldOut(CORPUS, 0.3, 'seed-1');
  assert.deepEqual(a.test, b.test);
  assert.deepEqual(a.train, b.train);
});

test('splitHeldOut is seed-sensitive: a different seed reshuffles the split', () => {
  const a = splitHeldOut(CORPUS, 0.3, 'seed-1');
  const b = splitHeldOut(CORPUS, 0.3, 'seed-2');
  assert.notDeepEqual(a.test, b.test);
});

test('splitHeldOut partitions completely: train and test cover the corpus with no overlap', () => {
  const { train, test } = splitHeldOut(CORPUS, 0.25, 's');
  assert.equal(train.length + test.length, CORPUS.length);
  const union = new Set([...train, ...test]);
  assert.equal(union.size, CORPUS.length);
});

test('splitHeldOut realized test fraction is roughly the ratio on a large corpus', () => {
  const { test: heldOut } = splitHeldOut(CORPUS, 0.3, 's');
  // 200 examples at 0.3; uniform hashing lands it near 60. Loose bound tolerates variance.
  assert.ok(heldOut.length > 40 && heldOut.length < 80, `held out ${heldOut.length} ≈ 60`);
});

test('splitHeldOut ratio 0 tests nothing; ratio 1 tests everything', () => {
  assert.equal(splitHeldOut(CORPUS, 0, 's').test.length, 0);
  assert.equal(splitHeldOut(CORPUS, 1, 's').test.length, CORPUS.length);
});

test('splitHeldOut clamps out-of-range and non-finite ratios (total, never throws)', () => {
  assert.equal(splitHeldOut(CORPUS, -5, 's').test.length, 0);
  assert.equal(splitHeldOut(CORPUS, 5, 's').test.length, CORPUS.length);
  assert.equal(splitHeldOut(CORPUS, Number.NaN, 's').test.length, 0);
});

test('splitHeldOut on an empty corpus yields two empty sides', () => {
  const { train, test } = splitHeldOut([], 0.5, 's');
  assert.deepEqual(train, []);
  assert.deepEqual(test, []);
});

// -----------------------------------------------------------------------------
// Tagger evaluation — per-field accuracy.
// -----------------------------------------------------------------------------

function truth(partial: Partial<TagPrediction> & Pick<TagPrediction, 'category'>): TagPrediction {
  return { name: null, brand: null, colorPrimary: null, colors: null, pattern: null, ...partial };
}

test('evaluateTagger: category is the headline, scored over every example', () => {
  const pairs: TagScoredPair[] = [
    { prediction: truth({ category: 'top' }), truth: truth({ category: 'top' }) },
    { prediction: truth({ category: 'bottom' }), truth: truth({ category: 'top' }) },
    { prediction: truth({ category: 'shoes' }), truth: truth({ category: 'shoes' }) },
    { prediction: truth({ category: 'bag' }), truth: truth({ category: 'hat' }) },
  ];
  const m = evaluateTagger(pairs);
  assert.equal(m.count, 4);
  assert.equal(m.category, 0.5); // 2 of 4 categories match
});

test('evaluateTagger: nullable fields score only over examples with non-null truth (support)', () => {
  const pairs: TagScoredPair[] = [
    // colorPrimary truth present, matches (case-insensitive/trimmed).
    { prediction: truth({ category: 'top', colorPrimary: 'Blue' }), truth: truth({ category: 'top', colorPrimary: 'blue' }) },
    // colorPrimary truth present, mismatch.
    { prediction: truth({ category: 'top', colorPrimary: 'red' }), truth: truth({ category: 'top', colorPrimary: 'green' }) },
    // colorPrimary truth absent — not counted in color support at all.
    { prediction: truth({ category: 'top', colorPrimary: 'black' }), truth: truth({ category: 'top' }) },
  ];
  const m = evaluateTagger(pairs);
  assert.equal(m.support.colorPrimary, 2);
  assert.equal(m.colorPrimary, 0.5); // 1 of the 2 supported examples matches
});

test('evaluateTagger: name is skipped — a wrong name never lowers a metric', () => {
  const pairs: TagScoredPair[] = [
    { prediction: truth({ category: 'top', name: 'totally wrong name' }), truth: truth({ category: 'top', name: 'White shirt' }) },
  ];
  const m = evaluateTagger(pairs);
  assert.equal(m.category, 1); // name mismatch is irrelevant; category still perfect
});

test('evaluateTagger: an abstention (null prediction) counts as a miss everywhere', () => {
  const pairs: TagScoredPair[] = [
    { prediction: null, truth: truth({ category: 'top', colorPrimary: 'blue', pattern: 'solid', brand: 'Acme' }) },
  ];
  const m = evaluateTagger(pairs);
  assert.equal(m.category, 0);
  assert.equal(m.colorPrimary, 0);
  assert.equal(m.pattern, 0);
  assert.equal(m.brand, 0);
});

test('evaluateTagger: empty input yields all-zero metrics with count 0', () => {
  const m = evaluateTagger([]);
  assert.equal(m.count, 0);
  assert.equal(m.category, 0);
  assert.equal(m.support.brand, 0);
});

test('runTagger + evaluateTagger: the deterministic fixture scores category-perfect on all-top truth', async () => {
  // The fixture always predicts category 'top', so it nails a corpus whose truth is all 'top'.
  const examples: TagCorrectionExample[] = [
    { input: {}, truth: truth({ category: 'top', colorPrimary: 'blue' }) },
    { input: { filenameHint: 'x' }, truth: truth({ category: 'top' }) },
  ];
  const pairs = await runTagger(createDeterministicTaggingProvider(), examples);
  const m = evaluateTagger(pairs);
  assert.equal(m.category, 1);
  // But it abstains on every nullable field (returns null), so colorPrimary misses.
  assert.equal(m.support.colorPrimary, 1);
  assert.equal(m.colorPrimary, 0);
});

// -----------------------------------------------------------------------------
// Ranker evaluation — pairwise accuracy + accept-rate@1.
// -----------------------------------------------------------------------------

const RCTX: OutfitRankContext = { userId: 'u', now: 0 };
const heuristic = createHeuristicOutfitRanker();

/** Build an accept/reject example whose heuristic score is driven by item count. */
function arExample(itemCount: number, accepted: boolean): AcceptRejectExample {
  const itemIds = Array.from({ length: itemCount }, (_, i) => `i${i}`);
  const candidate: OutfitCandidate = { outfitId: `o-${itemCount}-${accepted}`, itemIds };
  return { candidate, ctx: RCTX, accepted };
}

test('evaluateRanker: perfect pairwise accuracy when accepted outfits score higher', () => {
  // Accepted have more items (higher heuristic score) than rejected.
  const examples: AcceptRejectExample[] = [
    arExample(5, true),
    arExample(4, true),
    arExample(1, false),
    arExample(2, false),
  ];
  const m = evaluateRanker(heuristic, examples);
  assert.equal(m.count, 4);
  assert.equal(m.pairCount, 4); // 2 accepted × 2 rejected
  assert.equal(m.pairwiseAccuracy, 1);
});

test('evaluateRanker: worst pairwise accuracy when accepted outfits score lower', () => {
  const examples: AcceptRejectExample[] = [
    arExample(1, true),
    arExample(5, false),
  ];
  const m = evaluateRanker(heuristic, examples);
  assert.equal(m.pairwiseAccuracy, 0);
});

test('evaluateRanker: a tie in scores counts as half credit', () => {
  // Same item count ⇒ identical score for an accepted and a rejected example.
  const examples: AcceptRejectExample[] = [arExample(3, true), arExample(3, false)];
  const m = evaluateRanker(heuristic, examples);
  assert.equal(m.pairCount, 1);
  assert.equal(m.pairwiseAccuracy, 0.5);
});

test('evaluateRanker: no accept/reject pair (all accepted) yields pairCount 0 and accuracy 0', () => {
  const examples: AcceptRejectExample[] = [arExample(3, true), arExample(4, true)];
  const m = evaluateRanker(heuristic, examples);
  assert.equal(m.pairCount, 0);
  assert.equal(m.pairwiseAccuracy, 0);
  assert.equal(m.count, 2);
});

test('evaluateRanker: accept-rate@1 reflects the top-scored band', () => {
  // 8 examples; top quartile = 2. The two highest item counts are both accepted ⇒ 1.0.
  const examples: AcceptRejectExample[] = [
    arExample(8, true),
    arExample(7, true),
    arExample(1, false),
    arExample(2, false),
    arExample(3, false),
    arExample(4, false),
    arExample(5, false),
    arExample(6, false),
  ];
  const m = evaluateRanker(heuristic, examples);
  assert.equal(m.acceptRateAt1, 1);
});

test('evaluateRanker: empty input yields zeroed metrics', () => {
  const m = evaluateRanker(heuristic, []);
  assert.equal(m.count, 0);
  assert.equal(m.pairCount, 0);
  assert.equal(m.pairwiseAccuracy, 0);
  assert.equal(m.acceptRateAt1, 0);
});

// -----------------------------------------------------------------------------
// promotionVerdict — the gate. win / tie / loss / insufficient-data / at-threshold.
// -----------------------------------------------------------------------------

const ENOUGH = DEFAULT_MIN_TEST_COUNT; // 100

function metric(headline: number, count: number): VerdictMetric {
  return { headline, count };
}

test('promote on a clear measured win above the default margin', () => {
  const v = promotionVerdict(metric(0.7, ENOUGH), metric(0.75, ENOUGH));
  assert.equal(v.promote, true);
  assert.equal(v.reason, 'measured_win');
  assert.ok(Math.abs(v.deltas.headline - 0.05) < 1e-9);
});

test('EXACTLY at the margin promotes (>= is the bar)', () => {
  const v = promotionVerdict(metric(0.7, ENOUGH), metric(0.7 + DEFAULT_MIN_MARGIN, ENOUGH));
  assert.equal(v.promote, true);
  assert.equal(v.reason, 'measured_win');
});

test('just below the margin holds as no_improvement', () => {
  const v = promotionVerdict(metric(0.7, ENOUGH), metric(0.7 + DEFAULT_MIN_MARGIN - 0.001, ENOUGH));
  assert.equal(v.promote, false);
  assert.equal(v.reason, 'no_improvement');
});

test('an exact tie holds as no_improvement (not a regression)', () => {
  const v = promotionVerdict(metric(0.7, ENOUGH), metric(0.7, ENOUGH));
  assert.equal(v.promote, false);
  assert.equal(v.reason, 'no_improvement');
  assert.equal(v.deltas.headline, 0);
});

test('a candidate below baseline is a regression, held', () => {
  const v = promotionVerdict(metric(0.7, ENOUGH), metric(0.6, ENOUGH));
  assert.equal(v.promote, false);
  assert.equal(v.reason, 'regression');
  assert.ok(v.deltas.headline < 0);
});

test('insufficient data holds NO MATTER how good the metric looks — the honest guard', () => {
  // A candidate that is perfect (1.0) vs a terrible baseline (0.0), but only 3 test examples.
  const v = promotionVerdict(metric(0.0, 3), metric(1.0, 3));
  assert.equal(v.promote, false);
  assert.equal(v.reason, 'insufficient_data');
  assert.equal(v.deltas.candidateCount, 3);
});

test('insufficient data fires at the empty-corpus state (count 0) — today\'s reality', () => {
  const v = promotionVerdict(metric(0, 0), metric(0, 0));
  assert.equal(v.promote, false);
  assert.equal(v.reason, 'insufficient_data');
});

test('exactly at the minimum test count is enough to be considered (>=)', () => {
  const v = promotionVerdict(metric(0.5, ENOUGH), metric(0.6, DEFAULT_MIN_TEST_COUNT));
  assert.notEqual(v.reason, 'insufficient_data');
  assert.equal(v.promote, true);
});

test('one below the minimum test count still holds as insufficient_data', () => {
  const v = promotionVerdict(metric(0.5, ENOUGH), metric(0.9, DEFAULT_MIN_TEST_COUNT - 1));
  assert.equal(v.reason, 'insufficient_data');
});

test('a custom margin and min-count are honored', () => {
  // Tighter margin (0.10) not met by a 0.05 win, even with plenty of data.
  const tight = promotionVerdict(metric(0.7, ENOUGH), metric(0.75, ENOUGH), { minMargin: 0.1 });
  assert.equal(tight.reason, 'no_improvement');
  assert.equal(tight.deltas.requiredMargin, 0.1);
  // Lower min-count lets a small corpus through the guard.
  const loose = promotionVerdict(metric(0.5, 10), metric(0.6, 10), { minTestCount: 5 });
  assert.equal(loose.promote, true);
  assert.equal(loose.reason, 'measured_win');
});

test('non-finite options fall back to the documented defaults', () => {
  const v = promotionVerdict(metric(0.7, ENOUGH), metric(0.73, ENOUGH), {
    minMargin: Number.NaN,
    minTestCount: Number.POSITIVE_INFINITY,
  });
  // minTestCount fell back to 100, which ENOUGH meets; margin fell back to 0.02, met by 0.03.
  assert.equal(v.deltas.requiredMargin, DEFAULT_MIN_MARGIN);
  assert.equal(v.promote, true);
});
