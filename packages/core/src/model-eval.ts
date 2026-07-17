/**
 * @era/core — the OFFLINE EVAL HARNESS. PURE, TOTAL, dependency-free. This is where
 * "promote only on measured wins" stops being a slogan and becomes testable code.
 *
 * The two learnable seams — the tagger ({@link TaggingProvider}, tagging.ts) and the
 * outfit ranker ({@link OutfitRanker}, outfit-ranking.ts) — each accumulate a labeled
 * corpus as the app runs: a user who CORRECTS a garment's tags produces a
 * {@link TagCorrectionExample} (`ai_events` `tag_correction`), and a user who accepts or
 * rejects an outfit produces an {@link AcceptRejectExample} (`outfit_accept` /
 * `outfit_reject`). This module turns that corpus into a verdict: does a candidate model
 * BEAT the current baseline on held-out data by enough to promote? Everything here is
 * pure over arrays — no IO, no clock, no randomness — so a promotion decision is
 * reproducible and unit-tested.
 *
 * The honest state today: the corpus is EMPTY. The app is pre-launch, the vision key is
 * dormant, and Ovi accept/reject is dark, so no real examples exist yet. That is exactly
 * why {@link promotionVerdict} refuses to promote below a minimum sample size NO MATTER
 * the metric — "no data ⇒ never promote" is encoded as a hard guard, not left to
 * judgment. The day a real `ai_events` corpus exists, training + shipping a candidate is a
 * small step: run it through this harness, and promote only if the verdict says so.
 *
 * No server-only imports, so this subpath is client-safe (the eval can run anywhere the
 * corpus can be loaded). Import via the `@era/core/model-eval` subpath.
 */

import type { TagPrediction, TaggingInput, TaggingProvider } from './tagging.ts';
import type {
  OutfitCandidate,
  OutfitRankContext,
  OutfitRanker,
} from './outfit-ranking.ts';

// -----------------------------------------------------------------------------
// Corpus types — one labeled example per learnable seam.
// -----------------------------------------------------------------------------

/**
 * One tagger training example: the input a tagger saw, paired with the GROUND TRUTH —
 * the tags the user corrected to (an `ai_events` `tag_correction` payload). `truth` is a
 * full {@link TagPrediction} because a correction can touch any field; the metric compares
 * a provider's prediction against it field by field.
 */
export interface TagCorrectionExample {
  readonly input: TaggingInput;
  readonly truth: TagPrediction;
}

/**
 * One ranker training example: a candidate outfit shown to a user in a given context,
 * paired with whether the user ACCEPTED it (`outfit_accept`) or rejected it
 * (`outfit_reject`). The ranker metric asks whether the model scores the accepted
 * candidates above the rejected ones.
 */
export interface AcceptRejectExample {
  readonly candidate: OutfitCandidate;
  readonly ctx: OutfitRankContext;
  readonly accepted: boolean;
}

// -----------------------------------------------------------------------------
// Deterministic held-out split — no Math.random (forbidden in core, and it would
// make a split irreproducible). We hash (seed + index) so the SAME corpus and seed
// always carve the SAME test set, which is what makes a promotion verdict repeatable.
// -----------------------------------------------------------------------------

/** The train/test partition of a corpus. */
export interface HeldOutSplit<T> {
  readonly train: readonly T[];
  readonly test: readonly T[];
}

/**
 * A stable FNV-1a hash of a string → a uint32. The same construction the checkout
 * fixture uses for its deterministic price, reused here so the split is reproducible
 * without pulling in a dependency.
 */
function fnv1a(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

/**
 * Deterministically partition `examples` into train/test, assigning each example to the
 * test set with probability `ratio`. The assignment hashes `seedString` with the example's
 * INDEX (not its content), so:
 *   - the same corpus + same seed always yields the same split (reproducible), and
 *   - changing the seed reshuffles it (so a promotion can be checked across seeds).
 * `ratio` is clamped to [0, 1]; a non-finite ratio degrades to 0 (everything trains,
 * nothing tests) rather than throwing — the harness is total. Order within each side is
 * preserved. Pure; never throws.
 *
 * The hash → [0,1) mapping divides the uint32 by 2^32, and an example lands in `test` when
 * that fraction is below `ratio`. Uniform hashing means the realized test fraction
 * approaches `ratio` as the corpus grows; on a small corpus it can differ, which is one
 * more reason {@link promotionVerdict} gates on an absolute minimum test count, not a
 * fraction.
 */
export function splitHeldOut<T>(
  examples: readonly T[],
  ratio: number,
  seedString: string,
): HeldOutSplit<T> {
  const safeRatio = Number.isFinite(ratio) ? Math.min(1, Math.max(0, ratio)) : 0;
  const train: T[] = [];
  const test: T[] = [];
  for (let i = 0; i < examples.length; i += 1) {
    const example = examples[i] as T;
    // Divide by 2^32 to land the hash in [0, 1); below the ratio ⇒ held out for test.
    const fraction = fnv1a(`${seedString}:${i}`) / 0x1_0000_0000;
    if (fraction < safeRatio) {
      test.push(example);
    } else {
      train.push(example);
    }
  }
  return { train, test };
}

// -----------------------------------------------------------------------------
// Tagger evaluation — per-field accuracy over a test set. The headline metric is
// CATEGORY exact-match (the one NOT-NULL field, the field the whole pipeline keys on).
// -----------------------------------------------------------------------------

/**
 * Tagger accuracy over a test set, one rate per comparable field plus a headline.
 * Each rate is in [0, 1]. `count` is the number of test examples the metrics were
 * computed over (the sample-size input to {@link promotionVerdict}).
 *
 * Metric choices, and why:
 *   - `category` is the HEADLINE: it is the one NOT-NULL field, the field the pipeline
 *     commits to on every row, and the field a mis-tag most visibly breaks. Exact match.
 *   - `colorPrimary`, `pattern`, `brand` are exact-match too, but only over examples where
 *     the TRUTH has a non-null value for that field (a field the user left blank is not a
 *     labeled target, so it neither helps nor hurts). A field with no labeled examples
 *     reports rate 0 with its own 0 denominator — see {@link TaggerMetrics.support}.
 *   - `name` is deliberately SKIPPED: free-text names are fuzzy ('White shirt' vs 'white
 *     cotton shirt' are both fine), so an exact-match rate would be misleading. A future
 *     revision could add a normalized/fuzzy name score; today it is out of the metric.
 */
export interface TaggerMetrics {
  /** Headline: fraction of examples where predicted category == truth category. */
  readonly category: number;
  readonly colorPrimary: number;
  readonly pattern: number;
  readonly brand: number;
  /** Number of test examples scored (the denominator for `category`). */
  readonly count: number;
  /**
   * Per-field labeled-example counts (the denominators for the nullable fields). A field
   * with `support` 0 has no labeled truth, so its rate is 0 over nothing — a caller
   * comparing two models should ignore a field neither had support for.
   */
  readonly support: {
    readonly colorPrimary: number;
    readonly pattern: number;
    readonly brand: number;
  };
}

/**
 * A tagger prediction paired with the ground truth it is scored against — the unit
 * {@link evaluateTagger} consumes. Callers precompute these by running the provider's
 * (async) `classify` over each example's input; keeping the metric itself SYNC and pure
 * over an array is the cleaner shape (the async IO is the caller's, the scoring is
 * deterministic and trivially testable). {@link runTagger} is the provided helper that
 * does the async pass.
 */
export interface TagScoredPair {
  readonly prediction: TagPrediction | null;
  readonly truth: TagPrediction;
}

/**
 * Run a {@link TaggingProvider} over a corpus, producing the {@link TagScoredPair}s
 * {@link evaluateTagger} scores. This is the ONE async step (it calls `provider.classify`
 * per example); the scoring itself is sync. A provider that abstains (returns null) yields
 * a pair with `prediction: null`, which every field metric counts as a miss — an abstention
 * is not a correct answer. Order is preserved.
 */
export async function runTagger(
  provider: TaggingProvider,
  examples: readonly TagCorrectionExample[],
): Promise<readonly TagScoredPair[]> {
  const pairs: TagScoredPair[] = [];
  for (const example of examples) {
    const prediction = await provider.classify(example.input);
    pairs.push({ prediction, truth: example.truth });
  }
  return pairs;
}

/** Case-insensitive, trimmed equality for a nullable tag string. */
function tagEquals(a: string | null, b: string | null): boolean {
  if (a === null || b === null) {
    return a === b;
  }
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

/**
 * Score precomputed {@link TagScoredPair}s into {@link TaggerMetrics}. SYNC and pure over
 * the array. Category is scored over every example (its denominator is `count`); the
 * nullable fields are scored only over examples whose TRUTH is non-null for that field
 * (their denominators are the per-field `support`). A null prediction (abstention) counts
 * as a miss everywhere. An empty input yields all-zero metrics with `count` 0 — which
 * {@link promotionVerdict} reads as insufficient data. Never throws.
 */
export function evaluateTagger(pairs: readonly TagScoredPair[]): TaggerMetrics {
  let categoryHits = 0;
  let colorHits = 0;
  let colorSupport = 0;
  let patternHits = 0;
  let patternSupport = 0;
  let brandHits = 0;
  let brandSupport = 0;

  for (const { prediction, truth } of pairs) {
    if (prediction !== null && prediction.category === truth.category) {
      categoryHits += 1;
    }
    if (truth.colorPrimary !== null) {
      colorSupport += 1;
      if (prediction !== null && tagEquals(prediction.colorPrimary, truth.colorPrimary)) {
        colorHits += 1;
      }
    }
    if (truth.pattern !== null) {
      patternSupport += 1;
      if (prediction !== null && tagEquals(prediction.pattern, truth.pattern)) {
        patternHits += 1;
      }
    }
    if (truth.brand !== null) {
      brandSupport += 1;
      if (prediction !== null && tagEquals(prediction.brand, truth.brand)) {
        brandHits += 1;
      }
    }
  }

  const count = pairs.length;
  const rate = (hits: number, denom: number): number => (denom > 0 ? hits / denom : 0);
  return {
    category: rate(categoryHits, count),
    colorPrimary: rate(colorHits, colorSupport),
    pattern: rate(patternHits, patternSupport),
    brand: rate(brandHits, brandSupport),
    count,
    support: { colorPrimary: colorSupport, pattern: patternSupport, brand: brandSupport },
  };
}

// -----------------------------------------------------------------------------
// Ranker evaluation — does the model score outfits the user ACCEPTED above the ones
// they rejected? Two complementary views: pairwise accuracy + accept-rate@1.
// -----------------------------------------------------------------------------

/**
 * Ranker accuracy over a test set of accept/reject examples. Rates are in [0, 1].
 *
 * Metric choices, and why:
 *   - `pairwiseAccuracy` is the HEADLINE and the promotion metric. Over every (accepted,
 *     rejected) PAIR of examples, it asks: did the ranker give the accepted one a strictly
 *     higher score? This is a direct, threshold-free measure of whether the model orders
 *     accept above reject — exactly the job of a suggestion ranker. A tie (equal scores)
 *     counts as HALF credit: the model expressed no preference, which is better than
 *     ordering them wrong and worse than ordering them right. `pairCount` is the number of
 *     such pairs (0 when the test set is all-accept or all-reject — no pair to compare).
 *   - `acceptRateAt1` is a sanity companion: over the whole test set, the accept rate of
 *     the examples the ranker scores in its TOP quartile (its most-confident suggestions).
 *     It answers "when the model is sure, is it right?" and guards against a model that
 *     wins on pairs but is miscalibrated at the top. It is reported, not gated on.
 */
export interface RankerMetrics {
  /** Headline: fraction of (accept, reject) pairs the ranker orders correctly (ties = 0.5). */
  readonly pairwiseAccuracy: number;
  /** Number of (accept, reject) pairs compared (0 ⇒ pairwiseAccuracy is 0, undefined-ish). */
  readonly pairCount: number;
  /** Accept rate among the ranker's top-quartile-scored examples. */
  readonly acceptRateAt1: number;
  /** Number of test examples scored (the sample-size input to a promotion verdict). */
  readonly count: number;
}

/** An example's accept label paired with the score the ranker gave its candidate. */
interface ScoredExample {
  readonly accepted: boolean;
  readonly score: number;
}

/**
 * Score each example's candidate with the ranker (scoring one candidate at a time so a
 * pass is per-example and order-independent), then compute pairwise accuracy +
 * accept-rate@1. Pure over the array; `rank` is called per example but the ranker contract
 * forbids IO/clock/throws, so this stays deterministic. An empty input, or one with no
 * accept/reject pair, yields zeroed metrics with `count`/`pairCount` reflecting that —
 * which {@link promotionVerdict} reads as insufficient data. Never throws.
 */
export function evaluateRanker(
  ranker: OutfitRanker,
  examples: readonly AcceptRejectExample[],
): RankerMetrics {
  const scored: ScoredExample[] = examples.map((example) => {
    // Score the single candidate in its own context; [0] is the only ranked result.
    const ranked = ranker.rank([example.candidate], example.ctx);
    const score = ranked[0]?.score ?? 0;
    return { accepted: example.accepted, score };
  });

  // Pairwise: every accepted example vs every rejected example.
  const accepted = scored.filter((s) => s.accepted);
  const rejected = scored.filter((s) => !s.accepted);
  let correct = 0;
  for (const a of accepted) {
    for (const r of rejected) {
      if (a.score > r.score) {
        correct += 1;
      } else if (a.score === r.score) {
        correct += 0.5;
      }
    }
  }
  const pairCount = accepted.length * rejected.length;
  const pairwiseAccuracy = pairCount > 0 ? correct / pairCount : 0;

  // accept-rate@1: the accept rate among the top-quartile-scored examples. "Top-1" in
  // spirit — the ranker's most-confident band — generalized to a quartile so the metric
  // is meaningful on a test set larger than one suggestion. At least one example when the
  // set is non-empty.
  const acceptRateAt1 = topBandAcceptRate(scored);

  return { pairwiseAccuracy, pairCount, acceptRateAt1, count: examples.length };
}

/**
 * The accept rate among the highest-scored quartile (at least one example) of the scored
 * set. Sorts by score descending and averages the accept labels of the top band. Empty
 * input ⇒ 0. Pure.
 */
function topBandAcceptRate(scored: readonly ScoredExample[]): number {
  if (scored.length === 0) {
    return 0;
  }
  const sorted = [...scored].sort((a, b) => b.score - a.score);
  const bandSize = Math.max(1, Math.floor(sorted.length / 4));
  let accepts = 0;
  for (let i = 0; i < bandSize; i += 1) {
    if ((sorted[i] as ScoredExample).accepted) {
      accepts += 1;
    }
  }
  return accepts / bandSize;
}

// -----------------------------------------------------------------------------
// Promotion verdict — "promote only on measured wins". The gate that encodes both
// the win-margin rule AND the "no data ⇒ never promote" guard.
// -----------------------------------------------------------------------------

/**
 * The shape both {@link TaggerMetrics} and {@link RankerMetrics} share for a verdict:
 * a single headline metric to compare and the sample size behind it. The caller picks the
 * headline (category accuracy for a tagger, pairwise accuracy for a ranker) and passes
 * `{ headline, count }` for baseline and candidate.
 */
export interface VerdictMetric {
  /** The headline metric to compare, in [0, 1] (higher is better). */
  readonly headline: number;
  /** The number of test examples behind `headline` — the sample-size guard input. */
  readonly count: number;
}

/** Options for {@link promotionVerdict}. All have documented defaults. */
export interface PromotionOptions {
  /**
   * Minimum ABSOLUTE improvement in the headline metric the candidate must show over the
   * baseline to promote. Default {@link DEFAULT_MIN_MARGIN} = 0.02 (a two-percentage-point
   * absolute win). Absolute (not relative) so the bar is legible and can't be gamed by a
   * tiny baseline; two points is small enough to be reachable yet large enough to sit
   * outside sampling noise on a corpus at the minimum size.
   */
  readonly minMargin?: number;
  /**
   * Minimum candidate test count required to consider promotion AT ALL. Below this, the
   * verdict is always HOLD with reason `insufficient_data`, no matter how good the metric
   * looks — this is the "no corpus ⇒ never promote" guard, the honest default for a
   * pre-launch app with an empty `ai_events` table. Default {@link DEFAULT_MIN_TEST_COUNT}
   * = 100: below ~100 held-out examples a two-point margin is indistinguishable from noise,
   * so a "win" there is not a measured win.
   */
  readonly minTestCount?: number;
}

/** Default minimum absolute headline margin to promote: +2 percentage points. */
export const DEFAULT_MIN_MARGIN = 0.02;

/** Default minimum held-out test count below which promotion is never considered. */
export const DEFAULT_MIN_TEST_COUNT = 100;

/** Why a promotion verdict landed the way it did. */
export type PromotionReason =
  /** Candidate test count is below `minTestCount` — never promote without enough data. */
  | 'insufficient_data'
  /** Candidate beat baseline by at least `minMargin` on the headline — promote. */
  | 'measured_win'
  /** Candidate did not clear the margin (tie or within-margin) — hold. */
  | 'no_improvement'
  /** Candidate scored below baseline — hold. */
  | 'regression';

/** The verdict: whether to promote, why, and the measured deltas behind it. */
export interface PromotionVerdict {
  readonly promote: boolean;
  readonly reason: PromotionReason;
  readonly deltas: {
    /** candidate.headline − baseline.headline (positive ⇒ candidate is better). */
    readonly headline: number;
    /** The margin that had to be cleared (the effective `minMargin`). */
    readonly requiredMargin: number;
    /** The candidate test count checked against `minTestCount`. */
    readonly candidateCount: number;
  };
}

/**
 * Decide whether to promote a candidate model over the baseline. This is the codified
 * form of "promote only on measured wins":
 *
 *   1. GUARD FIRST: if the candidate's test count is below `minTestCount`, HOLD with
 *      `insufficient_data` — unconditionally, regardless of the metric. An impressive
 *      score on 3 examples is not evidence, and this is the state today (empty corpus).
 *   2. Otherwise compare headline deltas. Promote (`measured_win`) only if the candidate
 *      beats the baseline by AT LEAST `minMargin` (absolute). Exactly at the margin
 *      counts as a win (>= is deliberate: the threshold is the bar, and clearing it
 *      exactly clears it). A negative delta is a `regression`; a non-negative delta below
 *      the margin (including a tie) is `no_improvement`. Both HOLD.
 *
 * The baseline's own count is not gated — the baseline is already live; it is the
 * CANDIDATE that must prove itself on enough held-out data. Pure; never throws. Non-finite
 * inputs degrade safely: a non-finite margin falls back to the default, and a non-finite
 * headline delta (shouldn't happen with real metrics) is treated as no improvement.
 */
export function promotionVerdict(
  baseline: VerdictMetric,
  candidate: VerdictMetric,
  opts: PromotionOptions = {},
): PromotionVerdict {
  const requiredMargin =
    typeof opts.minMargin === 'number' && Number.isFinite(opts.minMargin)
      ? opts.minMargin
      : DEFAULT_MIN_MARGIN;
  const minTestCount =
    typeof opts.minTestCount === 'number' && Number.isFinite(opts.minTestCount)
      ? opts.minTestCount
      : DEFAULT_MIN_TEST_COUNT;

  const headlineDelta = candidate.headline - baseline.headline;
  const deltas = {
    headline: Number.isFinite(headlineDelta) ? headlineDelta : 0,
    requiredMargin,
    candidateCount: candidate.count,
  };

  // Guard first: no promotion below the minimum sample size, no matter the metric.
  if (candidate.count < minTestCount) {
    return { promote: false, reason: 'insufficient_data', deltas };
  }
  if (deltas.headline >= requiredMargin) {
    return { promote: true, reason: 'measured_win', deltas };
  }
  if (deltas.headline < 0) {
    return { promote: false, reason: 'regression', deltas };
  }
  return { promote: false, reason: 'no_improvement', deltas };
}
