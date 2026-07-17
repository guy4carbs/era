/**
 * Server-only selection of the garment TAGGER — the single decision point that
 * hands the item pipeline the live provider behind the ONE `@era/core/tagging`
 * `TaggingProvider` contract.
 *
 * The BASELINE is `createClaudeVisionTaggingProvider()`: a thin wrapper around the
 * EXACT Claude-vision `classify()` logic the item pipeline has always run
 * (`item-pipeline.ts` re-exports that logic as `classifyGarment` and this module
 * adapts it to the interface). It is `name: 'claude-vision'`, and it preserves every
 * current behavior byte-for-byte: the `isRealCredential` gate, the
 * `VISION_MEDIA_TYPES` skip, the forced `classify_garment` tool call, the
 * `coerceClassification` validation, the per-call timeout, and `null` on any failure
 * or dormant key. A `TagPrediction` is shape-identical to the pipeline's private
 * `Classification`, so nothing about persistence or the confirm screen changes.
 *
 * `getTaggingProvider()` reads `ERA_TAGGER_VARIANT` (server-authoritative, kept out of
 * the zod env schema — unset ⇒ baseline, the turnaround / try-on / checkout precedent)
 * via `parseModelVariant`. 'baseline' (the default) constructs the Claude-vision
 * provider. 'candidate' is the seam a trained model drops into: today no such model
 * exists, so the candidate branch WARNS and returns the baseline, so a fat-fingered
 * flag can never route live traffic onto a nonexistent model. Promotion of a real
 * candidate to baseline is a measured act gated by `promotionVerdict` (model-eval.ts),
 * not a flag flip — see docs/model-harness-runbook.md.
 *
 * Never import this from a client bundle — the baseline constructs the Anthropic SDK
 * client and reads a server env var.
 */
import { type TaggingProvider, parseModelVariant } from '@era/core';

import { classifyGarment } from './item-pipeline.ts';

/** The baseline provider name, stamped onto telemetry so a swap away from it is visible. */
const CLAUDE_VISION_TAGGER_NAME = 'claude-vision';

/**
 * The Claude-vision BASELINE tagger — the proven API path. `classify` is the existing
 * pipeline `classifyGarment` logic verbatim: it reads `imageBytesBase64` + `mediaType`
 * from the {@link TaggingInput} (exactly what the pipeline passes today), runs the
 * forced tool call, and returns a {@link TagPrediction} or `null` (dormant key,
 * unreadable media type, or any failure). This is THE baseline every eval scores
 * against.
 *
 * The provider takes base64 bytes (the client-safe contract shape) and decodes them to
 * the `Uint8Array` the SDK call needs; the pipeline, which already holds the raw bytes,
 * encodes once at the construction site. A provider given no image bytes abstains
 * (returns null) — it has nothing it can classify.
 */
export function createClaudeVisionTaggingProvider(): TaggingProvider {
  return {
    name: CLAUDE_VISION_TAGGER_NAME,
    classify(input) {
      if (input.imageBytesBase64 === undefined || input.mediaType === undefined) {
        // No image bytes to read ⇒ abstain, the same null the pipeline stored when
        // vision could not run. A future text-only tagger would read filenameHint here.
        return Promise.resolve(null);
      }
      const rawBytes = new Uint8Array(Buffer.from(input.imageBytesBase64, 'base64'));
      return classifyGarment(rawBytes, input.mediaType);
    },
  };
}

/**
 * The single construction site for the tagger the pipeline runs. Reads
 * `ERA_TAGGER_VARIANT` via {@link parseModelVariant}: 'baseline' (the safe default,
 * and every unset/typo value) builds the Claude-vision provider; 'candidate' is the
 * drop-in point for a trained model.
 *
 * There is no trained candidate yet, so the candidate branch does NOT silently run an
 * unproven model — it warns and falls back to the baseline. The day a real candidate
 * exists, wiring it is replacing the `console.warn` + baseline return with the trained
 * provider's construction; the pipeline, the route, and persistence do not change.
 * Called per-run — cheap, no I/O until `classify` fires.
 */
export function getTaggingProvider(): TaggingProvider {
  const variant = parseModelVariant(process.env.ERA_TAGGER_VARIANT);
  if (variant === 'candidate') {
    // The seam is ready; the model is not. Warn (observable) and use the proven
    // baseline rather than route traffic onto a model that doesn't exist yet.
    console.warn(
      '[era-models] tagger candidate variant selected but no trained model wired; using baseline',
    );
    return createClaudeVisionTaggingProvider();
  }
  return createClaudeVisionTaggingProvider();
}
