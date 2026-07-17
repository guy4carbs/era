/**
 * @era/core — A/B model-variant selection for the swappable model seams. PURE and
 * CLIENT-SAFE.
 *
 * The tagger ({@link TaggingProvider}, tagging.ts) and the outfit ranker
 * ({@link OutfitRanker}, outfit-ranking.ts) each have a proven BASELINE and, once a
 * learned model exists, a CANDIDATE. This module answers one question: for a given seam,
 * which variant is live? It is the A/B analogue of the boolean feature flags
 * ({@link isEraTryonEnabled}, tryon-flags.ts) — but where those gate a feature on/off,
 * this ROUTES between two proven-or-candidate implementations of the same interface. A
 * variant flip changes only which provider the seam's ONE construction site builds; it
 * never changes the interface, the route, or the client.
 *
 * The safe default is always the BASELINE. Only the exact string 'candidate' selects the
 * candidate — any other value (unset, 'true', 'CANDIDATE', a typo) reads as baseline, the
 * same exact-string discipline the boolean flags use, for the same reason: a fat-fingered
 * flag must never silently route live traffic onto an unproven model. Promotion of a
 * candidate to the new baseline is a deliberate, measured act gated by
 * `promotionVerdict` (model-eval.ts), not a flag flip.
 *
 * The flags are SERVER-AUTHORITATIVE: the server reads `ERA_TAGGER_VARIANT` and
 * `ERA_RANKER_VARIANT` and constructs the selected provider; there is no client mirror,
 * because which model runs is never a client decision (unlike the cosmetic
 * `NEXT_PUBLIC_*` feature mirrors). Kept out of the zod env schema like the other dormant
 * flags, so a missing value never blocks boot — unset simply means baseline.
 *
 * No server-only imports live here, so this subpath is client-safe. Import via the
 * `@era/core/model-flags` subpath. Never throws.
 */

/**
 * Which implementation of a model seam is live. `baseline` is the proven default (the
 * heuristic ranker / the Claude-vision or deterministic tagger); `candidate` is a learned
 * challenger under evaluation. A seam is only ever in one of these two states — promotion
 * REPLACES the baseline, it does not add a third variant.
 */
export type ModelVariant = 'baseline' | 'candidate';

/**
 * Parse a raw variant flag (e.g. `env.ERA_TAGGER_VARIANT` / `env.ERA_RANKER_VARIANT`)
 * into a {@link ModelVariant}. Returns `candidate` ONLY for the exact string 'candidate';
 * everything else — unset, blank, 'true', 'CANDIDATE', a misspelling — returns `baseline`,
 * the proven default. This mirrors {@link isEraTryonEnabled}'s exact-'true' discipline:
 * the safe fallback is total and no fuzzy value can half-route traffic onto an unproven
 * model. Never throws.
 */
export function parseModelVariant(raw: string | undefined): ModelVariant {
  return raw === 'candidate' ? 'candidate' : 'baseline';
}
