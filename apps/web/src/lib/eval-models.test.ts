/**
 * End-to-end proof that the model-eval runner works: reconstruct a synthetic
 * `ai_events` corpus, run baseline-vs-candidate through the full split → evaluate →
 * verdict pipeline, and assert the honest gates fire. This is the CI vehicle the task
 * asks for — it runs with zero env, zero network, and a fixed synthetic corpus, so the
 * runner is proven even while the real corpus is empty.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { TaggingProvider, TagPrediction } from '@era/core/tagging';
import { createHeuristicOutfitRanker } from '@era/core/outfit-ranking';

import {
  type AiEventRow,
  evalRanker,
  evalTagger,
  formatReport,
  reconstructCorpus,
} from './eval-models.ts';

// A tagger that always predicts a fixed category — a stand-in for a provider whose
// accuracy we control, so the verdict assertions are deterministic.
function fixedTagger(name: string, category: TagPrediction['category']): TaggingProvider {
  return {
    name,
    classify(): Promise<TagPrediction | null> {
      return Promise.resolve({ category, name: null, brand: null, colorPrimary: null, colors: null, pattern: null });
    },
  };
}

function tagEvent(category: TagPrediction['category']): AiEventRow {
  const truth: TagPrediction = { category, name: null, brand: null, colorPrimary: null, colors: null, pattern: null };
  return { kind: 'tag_correction', payload: { input: { filenameHint: 'x' }, truth } };
}

function rankEvent(accepted: boolean, itemIds: string[], affinity: number): AiEventRow {
  return {
    kind: accepted ? 'outfit_accept' : 'outfit_reject',
    payload: {
      candidate: { itemIds, features: { affinity } },
      ctx: { userId: 'u1', now: 1_000 },
    },
  };
}

test('reconstructCorpus pulls only trained kinds and skips malformed ones', () => {
  const rows: AiEventRow[] = [
    tagEvent('top'),
    rankEvent(true, ['a', 'b'], 1),
    { kind: 'ai_usage', payload: { model: 'x' } }, // ignored, not skipped
    { kind: 'tag_correction', payload: { field: 'brand', from: null, to: 'Nike' } }, // per-field legacy → skipped
    { kind: 'outfit_reject', payload: { candidate: {} } }, // malformed → skipped
  ];
  const corpus = reconstructCorpus(rows);
  assert.equal(corpus.tagger.length, 1);
  assert.equal(corpus.ranker.length, 1);
  assert.equal(corpus.skipped, 2);
});

test('empty corpus ⇒ HOLD insufficient_data (the honest pre-launch gate)', async () => {
  const corpus = reconstructCorpus([]);
  const baseline = fixedTagger('baseline', 'top');
  const candidate = fixedTagger('candidate', 'top');

  const taggerReport = await evalTagger(corpus.tagger, baseline, candidate);
  assert.equal(taggerReport.verdict.promote, false);
  assert.equal(taggerReport.verdict.reason, 'insufficient_data');

  const rankerReport = evalRanker(corpus.ranker, createHeuristicOutfitRanker(), createHeuristicOutfitRanker());
  assert.equal(rankerReport.verdict.promote, false);
  assert.equal(rankerReport.verdict.reason, 'insufficient_data');
});

test('tiny non-empty corpus still HOLDs insufficient_data (below min test count)', async () => {
  const rows: AiEventRow[] = Array.from({ length: 10 }, () => tagEvent('top'));
  const corpus = reconstructCorpus(rows);
  const report = await evalTagger(corpus.tagger, fixedTagger('baseline', 'top'), fixedTagger('candidate', 'bottom'));
  // Fewer than DEFAULT_MIN_TEST_COUNT (100) held-out examples ⇒ never promote.
  assert.equal(report.verdict.reason, 'insufficient_data');
  assert.equal(report.verdict.promote, false);
});

test('large corpus where candidate wins on category ⇒ PROMOTE measured_win', async () => {
  // 500 examples, all truth = 'top'. Baseline predicts 'bottom' (0% category), candidate
  // predicts 'top' (100%) — a clear, above-margin, above-sample-size measured win.
  const rows: AiEventRow[] = Array.from({ length: 500 }, () => tagEvent('top'));
  const corpus = reconstructCorpus(rows);
  const report = await evalTagger(corpus.tagger, fixedTagger('baseline', 'bottom'), fixedTagger('candidate', 'top'));
  assert.equal(report.verdict.promote, true);
  assert.equal(report.verdict.reason, 'measured_win');
  assert.ok(report.testExamples >= 100, 'held-out test set clears the sample-size guard');
});

test('large corpus where candidate regresses ⇒ HOLD regression', async () => {
  const rows: AiEventRow[] = Array.from({ length: 500 }, () => tagEvent('top'));
  const corpus = reconstructCorpus(rows);
  const report = await evalTagger(corpus.tagger, fixedTagger('baseline', 'top'), fixedTagger('candidate', 'bottom'));
  assert.equal(report.verdict.promote, false);
  assert.equal(report.verdict.reason, 'regression');
});

test('ranker eval: candidate baseline-vs-baseline is a tie ⇒ no promotion', () => {
  // 40 accepts (high affinity) + 40 rejects (low affinity). Two identical heuristic
  // rankers ⇒ identical scores ⇒ pairwise tie, and well under the sample-size guard.
  const rows: AiEventRow[] = [
    ...Array.from({ length: 40 }, (_v, i) => rankEvent(true, [`a${i}`, `b${i}`], 1)),
    ...Array.from({ length: 40 }, (_v, i) => rankEvent(false, [`c${i}`], 0)),
  ];
  const corpus = reconstructCorpus(rows);
  const report = evalRanker(corpus.ranker, createHeuristicOutfitRanker(), createHeuristicOutfitRanker());
  assert.equal(report.verdict.promote, false);
});

test('formatReport renders a legible PROMOTE/HOLD block', async () => {
  const rows: AiEventRow[] = Array.from({ length: 500 }, () => tagEvent('top'));
  const corpus = reconstructCorpus(rows);
  const report = await evalTagger(corpus.tagger, fixedTagger('baseline', 'bottom'), fixedTagger('candidate', 'top'));
  const text = formatReport(report);
  assert.match(text, /\[tagger\] PROMOTE — measured_win/);
  assert.match(text, /baseline: 0\.0%\s+candidate: 100\.0%/);
});
