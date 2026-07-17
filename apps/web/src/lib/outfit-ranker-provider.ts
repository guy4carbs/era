/**
 * Server-only selection of the OUTFIT-SUGGESTION ranker — the single decision point
 * behind the ONE `@era/core/outfit-ranking` `OutfitRanker` contract.
 *
 * `getOutfitRanker()` reads `ERA_RANKER_VARIANT` (server-authoritative, kept out of the
 * zod env schema — unset ⇒ baseline, the tagger / turnaround / checkout precedent) via
 * `parseModelVariant`. 'baseline' (the default) is `createHeuristicOutfitRanker()`, the
 * stable, deterministic REFERENCE the learned ranker must BEAT on measured accept-rate
 * before promotion (model-eval.ts `promotionVerdict`). 'candidate' is the seam a trained
 * ranker drops into: today no such model exists, so the candidate branch WARNS and
 * returns the baseline — a fat-fingered flag can never route suggestions onto a
 * nonexistent model.
 *
 * ── WHERE THIS INJECTS (and why it is not wired into Ovi TODAY) ───────────────────────
 * Ovi's suggestion path is currently a DETERMINISTIC COMPOSE, not a rank-candidates step:
 * `styleWithOvi` (ovi-server.ts) either asks Claude for one look or calls the
 * deterministic `composeOutfit`, and each returns a SINGLE outfit — there is no set of
 * candidate outfits to order. An `OutfitRanker` ranks a LIST of `OutfitCandidate`s; with
 * a compose step that emits one look, there is nothing to rank, so forcing the ranker in
 * here would be a fake integration (it would "rank" a one-element list — a no-op that
 * lies about being live). Honesty over a forced wire: the seam is built, tested, and
 * ready, but dark until Ovi's suggestion path becomes a rank-candidates step.
 *
 * The injection point, precisely: when Ovi's proposal path is refactored to (1) GENERATE
 * several candidate looks from the closet (variations on category/color/occasion) and
 * (2) pick among them, that pick becomes `getOutfitRanker().rank(candidates, { userId,
 * now })` at the ONE site in `ovi-server.ts` that today returns the single composed
 * outfit — the top-ranked candidate is the one shown, the rest can seed "more like this".
 * The accept/reject the user gives that suggestion is already logged (`ai_events`
 * `outfit_accept` / `outfit_reject`), which is exactly the `AcceptRejectExample` corpus
 * the learned ranker trains on. No route or persistence change is needed at that point —
 * only swapping the single-outfit return for a rank-and-take-top over generated
 * candidates. Until then this module is the ready, tested seam; see
 * docs/model-harness-runbook.md.
 *
 * No credential is read here (the baseline is pure), but this stays server-side so the
 * ONE construction site lives with the other model seams and reads the server env flag.
 */
import { type OutfitRanker, createHeuristicOutfitRanker, parseModelVariant } from '@era/core';

/**
 * The single construction site for the outfit ranker. Reads `ERA_RANKER_VARIANT` via
 * {@link parseModelVariant}: 'baseline' (the safe default, and every unset/typo value)
 * builds the heuristic reference ranker; 'candidate' is the drop-in point for a trained
 * ranker.
 *
 * There is no trained candidate yet, so the candidate branch does NOT silently run an
 * unproven model — it warns and falls back to the baseline. The day a real candidate
 * exists AND Ovi's path ranks candidates (see the module header), wiring it is replacing
 * the `console.warn` + baseline return with the trained ranker's construction. Called
 * per-run — cheap, pure, no I/O.
 */
export function getOutfitRanker(): OutfitRanker {
  const variant = parseModelVariant(process.env.ERA_RANKER_VARIANT);
  if (variant === 'candidate') {
    // The seam is ready; the model is not. Warn (observable) and use the proven
    // heuristic baseline rather than route suggestions onto a model that doesn't exist.
    console.warn(
      '[era-models] ranker candidate variant selected but no trained model wired; using baseline',
    );
    return createHeuristicOutfitRanker();
  }
  return createHeuristicOutfitRanker();
}
