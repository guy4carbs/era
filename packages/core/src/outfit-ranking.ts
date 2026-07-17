/**
 * @era/core — the swappable OUTFIT-SUGGESTION ranker seam. PURE, TOTAL, and
 * dependency-free.
 *
 * Ovi proposes outfits from the user's own closet, and the user accepts or rejects
 * each suggestion (→ `ai_events` `outfit_accept` / `outfit_reject`). That accept/reject
 * signal is the training target for a LEARNED outfit ranker: the model that, given a
 * set of candidate outfits, orders them so the ones the user would accept come first.
 * This module is the seam that ranker plugs into — a deliberate clone of
 * {@link FeedRanker} (feed-ranking.ts): a named strategy + a factory + the same
 * determinism/tie-break discipline, so a swap is one construction-site change with no
 * interface churn.
 *
 * The v1 implementation here is a documented HEURISTIC baseline
 * ({@link createHeuristicOutfitRanker}) — a stable, deterministic REFERENCE, not a
 * quality bar. Its whole job is to be the thing the future learned ranker must BEAT on
 * measured accept-rate before it can be promoted (see model-eval.ts `promotionVerdict`).
 * A baseline that never changes is what makes "did the candidate actually win?" a
 * meaningful question.
 *
 * Determinism is the point, so `now` is INJECTED via {@link OutfitRankContext} (never a
 * clock read inside `rank`), exactly as the feed ranker injects `now`: the same
 * candidates and the same `now` always produce the same order. No server-only imports,
 * so this subpath is client-safe. Import via the `@era/core/outfit-ranking` subpath.
 */

// -----------------------------------------------------------------------------
// Contract types — the pinned surface a ranker and its callers code against
// -----------------------------------------------------------------------------

/**
 * One candidate outfit the ranker is scoring. `itemIds` are the owned closet items the
 * look is built from (Ovi only ever proposes from owned pieces). `outfitId` is present
 * when the candidate is a saved outfit, absent for an on-the-fly proposal. `features`
 * is an OPAQUE numeric feature map — the seam's extension point: the heuristic reads a
 * couple of documented keys, and a learned ranker reads whatever its training produced,
 * both without changing this type. Numbers only (no free-text), so a feature vector
 * stays cheap to serialize into an `ai_events` payload.
 */
export interface OutfitCandidate {
  readonly outfitId?: string;
  readonly itemIds: readonly string[];
  readonly features?: Readonly<Record<string, number>>;
}

/**
 * The context for a ranking pass. `now` is INJECTED (epoch milliseconds), never read
 * from the system clock inside {@link OutfitRanker.rank}, so a pass is fully
 * deterministic and testable — the same discipline the feed ranker enforces with its
 * ISO `now`. `userId` is carried for a future personalized ranker; the v1 heuristic
 * does not read it (it scores only the candidate's own signals).
 */
export interface OutfitRankContext {
  readonly userId: string;
  readonly now: number;
}

/** A candidate paired with the score the ranker gave it. */
export interface RankedOutfit {
  readonly candidate: OutfitCandidate;
  readonly score: number;
}

/**
 * The swappable outfit-ranking strategy. `name` identifies the algorithm (echoed into
 * telemetry so a swap is observable, exactly like {@link FeedRanker.name}); `rank`
 * orders candidates for a user. Implementations MUST be pure and total: no IO, no clock
 * reads (use `ctx.now`), no throws.
 */
export interface OutfitRanker {
  readonly name: string;
  rank(candidates: readonly OutfitCandidate[], ctx: OutfitRankContext): readonly RankedOutfit[];
}

// -----------------------------------------------------------------------------
// v1: the heuristic baseline. A documented, deterministic REFERENCE — the score
// the learned ranker must beat, not a quality target in its own right.
// -----------------------------------------------------------------------------

/** The ranker name, stamped onto telemetry so a swap away from the baseline is visible. */
const HEURISTIC_OUTFIT_NAME = 'heuristic-baseline-v1';

/**
 * The feature key the baseline treats as a learned/precomputed quality prior, when a
 * caller supplies one. Absent ⇒ contributes 0, so the baseline degrades to pure
 * structure (item count) with no features — total, never throws. A learned ranker is
 * free to ignore this key and read its own; the baseline just needs SOME documented,
 * stable signal to order by.
 */
const AFFINITY_FEATURE_KEY = 'affinity';

/** Weight on the item count — a modest structural prior (a fuller look scores higher). */
const ITEM_COUNT_WEIGHT = 1;

/** Weight on the optional `affinity` feature, when present. */
const AFFINITY_WEIGHT = 10;

/**
 * The v1 baseline score for one candidate:
 *   `ITEM_COUNT_WEIGHT · |itemIds| + AFFINITY_WEIGHT · (features.affinity ?? 0)`
 * A deliberately SIMPLE, documented reference: it rewards a fuller look and an optional
 * precomputed affinity prior, and nothing else. It is NOT trying to be good — it is
 * trying to be STABLE, so the learned ranker's measured accept-rate has a fixed line to
 * clear. A non-finite `affinity` (NaN/Infinity from a malformed feature) is floored to 0
 * so the score stays finite and the ranker stays total.
 */
function scoreCandidate(candidate: OutfitCandidate): number {
  const itemCount = candidate.itemIds.length;
  const affinityRaw = candidate.features?.[AFFINITY_FEATURE_KEY];
  const affinity = typeof affinityRaw === 'number' && Number.isFinite(affinityRaw) ? affinityRaw : 0;
  return ITEM_COUNT_WEIGHT * itemCount + AFFINITY_WEIGHT * affinity;
}

/**
 * A stable string key for a candidate's identity, used only as the final tie-break so
 * the order is TOTAL and deterministic even when two candidates score identically. A
 * saved outfit keys on its `outfitId`; an on-the-fly proposal (no id) keys on its sorted
 * item ids, which is stable for the same set of pieces.
 */
function candidateKey(candidate: OutfitCandidate): string {
  if (candidate.outfitId !== undefined) {
    return `id:${candidate.outfitId}`;
  }
  return `items:${[...candidate.itemIds].sort().join(',')}`;
}

/**
 * Construct the v1 heuristic ranker. Pure and total: it reads only the candidates
 * (and, for a learned successor, `ctx` — the baseline ignores it), never the clock or
 * the network.
 *
 * Order is score DESCENDING with a fully-specified tie-break chain so the order is total
 * and stable even when scores collide: score desc → candidate key ascending (see
 * {@link candidateKey}). The key tail guarantees a deterministic order for two
 * equal-scoring candidates, cloning {@link createRecencyFollowsEngagementRanker}'s
 * tie-break discipline.
 */
export function createHeuristicOutfitRanker(): OutfitRanker {
  return {
    name: HEURISTIC_OUTFIT_NAME,
    rank(candidates: readonly OutfitCandidate[], ctx: OutfitRankContext): readonly RankedOutfit[] {
      // The heuristic baseline scores only a candidate's own signals; `ctx` (userId,
      // now) is part of the interface a learned successor will read, so `void` documents
      // the deliberate no-read without dropping the parameter.
      void ctx;
      const scored = candidates.map((candidate): RankedOutfit => ({
        candidate,
        score: scoreCandidate(candidate),
      }));

      return scored.sort((a, b) => {
        if (b.score !== a.score) {
          return b.score - a.score;
        }
        // Tie-break: candidate key ascending — total, stable, deterministic.
        const keyA = candidateKey(a.candidate);
        const keyB = candidateKey(b.candidate);
        if (keyA !== keyB) {
          return keyA < keyB ? -1 : 1;
        }
        return 0;
      });
    },
  };
}
