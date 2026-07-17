/**
 * The reusable core of the offline model-eval RUNNER (the CLI wrapper is
 * `scripts/eval-models.ts`). Pure over an in-memory list of `ai_events` — no file I/O,
 * no process/argv here — so the whole reconstruction + verdict pipeline is unit-tested
 * end to end with a synthetic corpus. The CLI supplies the JSONL parsing and the
 * provider instances; this module reconstructs the labeled corpus and produces the
 * PROMOTE/HOLD verdicts.
 *
 * The honest state today: the `ai_events` corpus is EMPTY (pre-launch, vision dormant,
 * Ovi accept/reject dark), so every real run reports HOLD `insufficient_data` — the
 * `promotionVerdict` sample-size guard. This runner is the READINESS: the day a real
 * corpus exists, point the CLI at it and the same pipeline yields a measured verdict.
 * See docs/model-harness-runbook.md.
 */
import {
  type AcceptRejectExample,
  type TagCorrectionExample,
  type PromotionVerdict,
  evaluateRanker,
  evaluateTagger,
  promotionVerdict,
  runTagger,
  splitHeldOut,
} from '@era/core/model-eval';
import type { TaggingProvider } from '@era/core/tagging';
import type { OutfitRanker } from '@era/core/outfit-ranking';

/**
 * One row of an `ai_events` JSONL export — the minimal shape the runner reads. `kind`
 * routes reconstruction; `payload` is the JSONB the app wrote. Unknown kinds are ignored
 * so an export can carry every event type (`ai_usage`, `outfit_view`, …) and the runner
 * only pulls the two it trains on.
 */
export interface AiEventRow {
  readonly kind: string;
  readonly payload: unknown;
}

/** The corpus reconstructed from an export, split per learnable seam. */
export interface ReconstructedCorpus {
  readonly tagger: readonly TagCorrectionExample[];
  readonly ranker: readonly AcceptRejectExample[];
  /** Events that matched a trained kind but could not be reconstructed (malformed payload). */
  readonly skipped: number;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null;
}

/**
 * Reconstruct a full {@link TagCorrectionExample} from a `tag_correction` payload, or
 * null when the payload cannot yield a scorable example.
 *
 * IMPORTANT — the payload shape gap: today's `tag_correction` events are written ONE PER
 * CHANGED FIELD (`{ itemId, field, from, to, taggerName }`) and carry NO image reference,
 * so a single event is NOT a full example (which needs the tagger's INPUT + the full
 * corrected {@link TagPrediction} truth). This reconstructor therefore reads a
 * SELF-CONTAINED example payload — `{ input: TaggingInput, truth: TagPrediction }` — the
 * shape a future export step will assemble by joining a correction back to its item's
 * image and merged final tags. On the current per-field events it finds no `input`/`truth`
 * and skips them (counted in `skipped`), which is the honest behavior: an unjoinable
 * correction is not yet a training example. The synthetic fixture + a real joined export
 * both use the self-contained shape.
 */
function reconstructTagExample(payload: unknown): TagCorrectionExample | null {
  const record = asRecord(payload);
  if (record === null) {
    return null;
  }
  const input = asRecord(record.input);
  const truth = asRecord(record.truth);
  if (input === null || truth === null) {
    return null;
  }
  if (typeof truth.category !== 'string') {
    return null;
  }
  // Trust the export's shape for the nested contract objects; the eval metrics are total
  // over whatever fields are present (missing nullable fields simply have no support). The
  // `unknown` hop is required because a loose Record doesn't structurally overlap the
  // readonly-array-bearing contract types.
  return {
    input: input as unknown as TagCorrectionExample['input'],
    truth: truth as unknown as TagCorrectionExample['truth'],
  };
}

/**
 * Reconstruct an {@link AcceptRejectExample} from an `outfit_accept` / `outfit_reject`
 * payload. `accepted` is derived from the event kind; the payload supplies the candidate
 * (its `itemIds`, optional `outfitId`/`features`) and the ranking context (`userId`,
 * `now`). A payload missing the candidate or context is skipped.
 */
function reconstructRankExample(kind: string, payload: unknown): AcceptRejectExample | null {
  const record = asRecord(payload);
  if (record === null) {
    return null;
  }
  const candidate = asRecord(record.candidate);
  const ctx = asRecord(record.ctx);
  if (candidate === null || ctx === null) {
    return null;
  }
  if (!Array.isArray(candidate.itemIds) || typeof ctx.userId !== 'string' || typeof ctx.now !== 'number') {
    return null;
  }
  return {
    accepted: kind === 'outfit_accept',
    // The `unknown` hop bridges the loose Record to the readonly-array-bearing contract.
    candidate: candidate as unknown as AcceptRejectExample['candidate'],
    ctx: ctx as unknown as AcceptRejectExample['ctx'],
  };
}

/** Reconstruct the labeled corpus from a list of exported `ai_events` rows. */
export function reconstructCorpus(rows: readonly AiEventRow[]): ReconstructedCorpus {
  const tagger: TagCorrectionExample[] = [];
  const ranker: AcceptRejectExample[] = [];
  let skipped = 0;

  for (const row of rows) {
    if (row.kind === 'tag_correction') {
      const example = reconstructTagExample(row.payload);
      if (example === null) {
        skipped += 1;
      } else {
        tagger.push(example);
      }
    } else if (row.kind === 'outfit_accept' || row.kind === 'outfit_reject') {
      const example = reconstructRankExample(row.kind, row.payload);
      if (example === null) {
        skipped += 1;
      } else {
        ranker.push(example);
      }
    }
    // Any other kind is not a trained signal — ignored, not skipped.
  }

  return { tagger, ranker, skipped };
}

/** The held-out split parameters — fixed so a run is reproducible across invocations. */
const HELD_OUT_RATIO = 0.3;
const TAGGER_SEED = 'era-tagger-eval-v1';
const RANKER_SEED = 'era-ranker-eval-v1';

/** A per-model evaluation result: the verdict plus the example counts behind it. */
export interface ModelEvalReport {
  readonly model: 'tagger' | 'ranker';
  readonly verdict: PromotionVerdict;
  readonly baselineHeadline: number;
  readonly candidateHeadline: number;
  readonly totalExamples: number;
  readonly testExamples: number;
}

/**
 * Evaluate the tagger seam: split the corpus, run BOTH providers over the held-out test
 * set, and produce the promotion verdict on category accuracy (the headline). The
 * baseline's held-out count is not gated; the candidate must clear the sample-size guard.
 */
export async function evalTagger(
  corpus: readonly TagCorrectionExample[],
  baseline: TaggingProvider,
  candidate: TaggingProvider,
): Promise<ModelEvalReport> {
  const { test } = splitHeldOut(corpus, HELD_OUT_RATIO, TAGGER_SEED);
  const baselineMetrics = evaluateTagger(await runTagger(baseline, test));
  const candidateMetrics = evaluateTagger(await runTagger(candidate, test));
  const verdict = promotionVerdict(
    { headline: baselineMetrics.category, count: baselineMetrics.count },
    { headline: candidateMetrics.category, count: candidateMetrics.count },
  );
  return {
    model: 'tagger',
    verdict,
    baselineHeadline: baselineMetrics.category,
    candidateHeadline: candidateMetrics.category,
    totalExamples: corpus.length,
    testExamples: test.length,
  };
}

/**
 * Evaluate the ranker seam: split the corpus, score BOTH rankers over the held-out test
 * set, and produce the promotion verdict on pairwise accuracy (the headline).
 */
export function evalRanker(
  corpus: readonly AcceptRejectExample[],
  baseline: OutfitRanker,
  candidate: OutfitRanker,
): ModelEvalReport {
  const { test } = splitHeldOut(corpus, HELD_OUT_RATIO, RANKER_SEED);
  const baselineMetrics = evaluateRanker(baseline, test);
  const candidateMetrics = evaluateRanker(candidate, test);
  const verdict = promotionVerdict(
    { headline: baselineMetrics.pairwiseAccuracy, count: baselineMetrics.count },
    { headline: candidateMetrics.pairwiseAccuracy, count: candidateMetrics.count },
  );
  return {
    model: 'ranker',
    verdict,
    baselineHeadline: baselineMetrics.pairwiseAccuracy,
    candidateHeadline: candidateMetrics.pairwiseAccuracy,
    totalExamples: corpus.length,
    testExamples: test.length,
  };
}

/** Render one {@link ModelEvalReport} as a human-readable PROMOTE/HOLD block. */
export function formatReport(report: ModelEvalReport): string {
  const decision = report.verdict.promote ? 'PROMOTE' : 'HOLD';
  const pct = (n: number): string => `${(n * 100).toFixed(1)}%`;
  const { headline, requiredMargin, candidateCount } = report.verdict.deltas;
  const sign = headline >= 0 ? '+' : '';
  return [
    `[${report.model}] ${decision} — ${report.verdict.reason}`,
    `  examples: ${report.totalExamples} total, ${report.testExamples} held-out (${candidateCount} scored)`,
    `  baseline: ${pct(report.baselineHeadline)}  candidate: ${pct(report.candidateHeadline)}  delta: ${sign}${pct(headline)} (need +${pct(requiredMargin)})`,
  ].join('\n');
}
