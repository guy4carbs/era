/**
 * @era/core — the swappable garment TAGGER seam. PURE contract + a deterministic
 * fixture; the real vision provider lives server-side.
 *
 * Adding an item runs a classification stage: given an image, produce the garment's
 * category / colors / pattern / brand / name (the shape `processItemPipeline`'s
 * `classify()` returns today). This module abstracts that one step behind a
 * {@link TaggingProvider} interface so the classifier is SWAPPABLE — a future
 * custom vision model is a new implementation of the same interface, dropped in at
 * the pipeline's one construction site with no change to the route, the persistence,
 * or the confirm screen. It mirrors {@link FeedRanker} (feed-ranking.ts) and
 * {@link CheckoutProvider} (checkout.ts): a named strategy + a factory + a
 * deterministic fixture that is the $0 test vehicle.
 *
 * The Claude-vision BASELINE provider is NOT built here — it needs the Anthropic
 * SDK and a server env read, both server-only. It is built server-side (Forge-server)
 * as `createClaudeVisionTaggingProvider()` wrapping the existing `classify()` logic
 * from `apps/web/src/lib/item-pipeline.ts`, implementing this same interface. This
 * module owns the CONTRACT + the deterministic stand-in; the server owns the
 * network-bound implementation. That split is exactly how checkout.ts splits the
 * Rye adapter (server) from the fixture provider (here).
 *
 * No server-only imports live here (no Anthropic SDK, no env reads, no DB), so this
 * subpath is client-safe. `TagPrediction` is the pinned shared contract; it mirrors
 * the pipeline's private `Classification` type (kept in sync by hand — the pipeline
 * maps it onto the camelCase `items` columns at insert). Import via the
 * `@era/core/tagging` subpath.
 */

import type { ItemCategory } from '@era/db';

// -----------------------------------------------------------------------------
// Contract types — the pinned surface a tagger and its callers code against
// -----------------------------------------------------------------------------

/**
 * A tagger's structured prediction for one garment — the shared contract, identical
 * in shape to the pipeline's private `Classification` (item-pipeline.ts): the fields
 * a vision pass fills and the confirm screen lets the user correct. `category` is the
 * headline (NOT NULL on the row, so a provider always commits to one); everything else
 * is nullable (null = "unknown / not visible", the same abstain-per-field the pipeline
 * already stores). A user's CORRECTED tags are also a `TagPrediction` — that is the
 * training target (the `truth` in {@link TagCorrectionExample}, model-eval.ts).
 */
export interface TagPrediction {
  readonly category: ItemCategory;
  readonly name: string | null;
  readonly brand: string | null;
  readonly colorPrimary: string | null;
  readonly colors: readonly string[] | null;
  readonly pattern: string | null;
}

/**
 * What a tagger is given to classify one item. Deliberately ABSTRACT over the input
 * so different providers can read different signals: the Claude-vision baseline uses
 * `imageBytesBase64` + `mediaType` (exactly what the pipeline passes today); a future
 * lightweight model might key off only `filenameHint` or metadata. All fields are
 * optional so a provider declares what it needs and a caller supplies what it has —
 * a provider that gets nothing it can use abstains (returns null).
 */
export interface TaggingInput {
  /** Base64-encoded image bytes — what the Claude-vision baseline classifies. */
  readonly imageBytesBase64?: string;
  /** IANA media type of the image (e.g. 'image/jpeg'), when bytes are supplied. */
  readonly mediaType?: string;
  /** A filename or short text hint, when available (e.g. from a link import). */
  readonly filenameHint?: string;
}

/**
 * The swappable tagging strategy. `name` identifies the provider (echoed into the
 * `ai_events`/telemetry so a swap is observable, exactly like {@link FeedRanker.name}).
 * `classify` returns a {@link TagPrediction}, or `null` to ABSTAIN — the same signal
 * the pipeline's `classify()` uses today when no key is configured or the media type
 * is unreadable, at which point the item saves with placeholder tags for manual review.
 * `classify` is async to match the network-bound baseline's signature exactly.
 */
export interface TaggingProvider {
  readonly name: string;
  classify(input: TaggingInput): Promise<TagPrediction | null>;
}

// -----------------------------------------------------------------------------
// Deterministic fixture — the $0 test vehicle + the honest current-behavior
// stand-in when no real vision key is configured.
// -----------------------------------------------------------------------------

/** The provider name, stamped onto telemetry so a swap away from it is visible. */
const DETERMINISTIC_TAGGING_NAME = 'deterministic';

/**
 * The fixed placeholder this fixture always returns — the honest "we could not read
 * the image" prediction. Category 'top' matches the pipeline's placeholder default
 * (`classification?.category ?? 'top'`), and every optional field is null (unknown),
 * so a saved item lands in exactly the same state the pipeline produces when vision
 * is dormant: a best-guess category and blank tags the confirm screen forces the user
 * to review. Never claims tags it did not derive.
 */
const DETERMINISTIC_PREDICTION: TagPrediction = {
  category: 'top',
  name: null,
  brand: null,
  colorPrimary: null,
  colors: null,
  pattern: null,
};

/**
 * A {@link TaggingProvider} that returns a fixed placeholder for any input — the
 * deterministic, offline, $0 test vehicle, and the honest stand-in for the current
 * dormant-vision behavior (the app ships pre-launch with the vision key dormant, so
 * today's tagger already emits placeholders). Same shape as the Claude-vision baseline
 * so tests exercise the seam with no network, no key, and no spend; the same
 * substitution the real provider makes at the pipeline's construction site.
 *
 * Never abstains — it always commits to the placeholder — so a caller wiring the
 * seam always gets a row it can save (the confirm screen handles the review). A
 * provider that SHOULD abstain (e.g. an unreadable media type) is the baseline's
 * job; the fixture's contract is "always the same placeholder".
 */
export function createDeterministicTaggingProvider(): TaggingProvider {
  return {
    name: DETERMINISTIC_TAGGING_NAME,
    classify(input: TaggingInput): Promise<TagPrediction | null> {
      // The fixture ignores the input by design — it always returns the same
      // placeholder. `void` documents the deliberate no-read and keeps the interface
      // signature intact.
      void input;
      return Promise.resolve(DETERMINISTIC_PREDICTION);
    },
  };
}
