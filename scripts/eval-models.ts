/**
 * Offline model-eval RUNNER (CLI). Point it at a JSONL export of the `ai_events` table
 * and it reconstructs the labeled corpus, runs the BASELINE vs the CANDIDATE for both
 * learnable seams (the garment tagger and the outfit ranker), and prints a PROMOTE/HOLD
 * verdict per model with the metric deltas and example counts.
 *
 *   node --experimental-strip-types scripts/eval-models.ts <path-to-ai_events.jsonl>
 *
 * The reusable pipeline lives in `apps/web/src/lib/eval-models.ts` (unit-tested end to
 * end with a synthetic corpus); this file is the thin I/O shell — argv, file read, JSONL
 * parse, provider construction, print, exit code.
 *
 * TODAY the `ai_events` corpus is EMPTY (pre-launch, vision dormant, Ovi accept/reject
 * dark), so every real run reports HOLD `insufficient_data` — the honest sample-size
 * gate, not a bug. This runner is the readiness; see docs/model-harness-runbook.md for
 * how to export the corpus and read the verdict when one exists. Exit code is 0 whether
 * the verdict is PROMOTE or HOLD (a HOLD is a valid answer, not a failure); it is
 * non-zero only on a usage/IO error.
 */
import { readFileSync } from 'node:fs';

import { createHeuristicOutfitRanker } from '@era/core/outfit-ranking';
import { createDeterministicTaggingProvider } from '@era/core/tagging';

import {
  type AiEventRow,
  evalRanker,
  evalTagger,
  formatReport,
  reconstructCorpus,
} from '../apps/web/src/lib/eval-models.ts';

/** Parse a JSONL file into `ai_events` rows, tolerating blank lines. */
function parseJsonl(text: string): AiEventRow[] {
  const rows: AiEventRow[] = [];
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i]?.trim();
    if (!line) {
      continue;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      throw new Error(`malformed JSON on line ${i + 1}`);
    }
    if (typeof parsed !== 'object' || parsed === null || typeof (parsed as { kind?: unknown }).kind !== 'string') {
      throw new Error(`line ${i + 1} is not an ai_events row ({ kind, payload })`);
    }
    const row = parsed as Record<string, unknown>;
    rows.push({ kind: row.kind as string, payload: row.payload });
  }
  return rows;
}

async function main(): Promise<void> {
  const path = process.argv[2];
  if (!path) {
    console.error('usage: node --experimental-strip-types scripts/eval-models.ts <ai_events.jsonl>');
    process.exitCode = 2;
    return;
  }

  let text: string;
  try {
    text = readFileSync(path, 'utf8');
  } catch (error) {
    console.error(`could not read ${path}:`, error instanceof Error ? error.message : error);
    process.exitCode = 2;
    return;
  }

  const rows = parseJsonl(text);
  const corpus = reconstructCorpus(rows);

  console.log(`Era model-eval — ${rows.length} events read from ${path}`);
  console.log(
    `  reconstructed: ${corpus.tagger.length} tagger examples, ${corpus.ranker.length} ranker examples` +
      (corpus.skipped > 0 ? ` (${corpus.skipped} trained events skipped — not yet joinable to a full example)` : ''),
  );
  console.log('');

  // BASELINE vs CANDIDATE. No trained candidate exists yet, so we evaluate the proven
  // baseline against ITSELF — which correctly yields HOLD (no improvement over itself,
  // and insufficient_data on the empty/tiny corpus). When a trained candidate ships, its
  // provider replaces the second argument here (and the eval reads the same corpus).
  const taggerBaseline = createDeterministicTaggingProvider();
  const taggerCandidate = createDeterministicTaggingProvider();
  const rankerBaseline = createHeuristicOutfitRanker();
  const rankerCandidate = createHeuristicOutfitRanker();

  const taggerReport = await evalTagger(corpus.tagger, taggerBaseline, taggerCandidate);
  const rankerReport = evalRanker(corpus.ranker, rankerBaseline, rankerCandidate);

  console.log(formatReport(taggerReport));
  console.log('');
  console.log(formatReport(rankerReport));
  console.log('');

  const anyPromote = taggerReport.verdict.promote || rankerReport.verdict.promote;
  console.log(anyPromote ? 'Result: at least one model is a measured win — flip its ERA_*_VARIANT.' : 'Result: HOLD — no measured win; keep the baseline.');
  // A HOLD is a valid verdict, not an error — exit 0 either way.
}

await main();
