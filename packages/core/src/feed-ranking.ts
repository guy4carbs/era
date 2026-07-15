/**
 * @era/core — the swappable feed ranker. PURE, TOTAL, and dependency-free.
 *
 * The server assembles a page of {@link FeedCandidate}s (a keyset window over the
 * `(created_at DESC, id DESC)` stream) and hands them to a {@link FeedRanker},
 * which ORDERS them — it never fetches, never mutates, never reaches for the
 * clock. v1 is {@link createRecencyFollowsEngagementRanker}: a documented
 * recency + follows + engagement scorer. A future recommender is a NEW
 * implementation of the same interface, swapped in at the one construction site
 * in `feed-server.ts` — no route or client changes.
 *
 * Determinism is the whole point, so `now` is INJECTED via {@link ViewerContext}
 * (never `Date.now()` inside `rank`): the same candidates and the same `now`
 * always produce the same order, which is what makes the ranker unit-testable and
 * keeps pagination stable across a page's assembly.
 *
 * No server-only imports live here, so this subpath is safe in a client bundle
 * (a client can preview ordering against the same logic). Import via the
 * `@era/core/feed-ranking` subpath.
 */

/**
 * One post the server is considering for the feed, trimmed to the signals the
 * ranker scores. `createdAt` is an ISO-8601 string (the wire/DB shape);
 * `isFollowedCreator` is resolved per-viewer by the server. Counts are the live
 * COUNT(*) values — no denormalized counters.
 */
export interface FeedCandidate {
  readonly postId: string;
  readonly creatorId: string;
  readonly createdAt: string;
  readonly likeCount: number;
  readonly saveCount: number;
  readonly isFollowedCreator: boolean;
}

/**
 * The viewer's context for a ranking pass. `now` is INJECTED (an ISO-8601
 * instant), never read from the system clock inside {@link FeedRanker.rank}, so a
 * pass is fully deterministic and testable. `viewerId` is carried for future
 * personalization; v1's scorer doesn't read it (follows are already baked into
 * each candidate's `isFollowedCreator`).
 */
export interface ViewerContext {
  readonly viewerId: string;
  readonly now: string;
}

/** A candidate paired with the score the ranker gave it. */
export interface RankedCandidate {
  readonly candidate: FeedCandidate;
  readonly score: number;
}

/**
 * The swappable ranking strategy. `name` identifies the algorithm (echoed into
 * the feed response's `ranker` field so a swap is observable on the wire); `rank`
 * orders a page of candidates for a viewer. Implementations MUST be pure and
 * total: no IO, no clock reads (use `ctx.now`), no throws.
 */
export interface FeedRanker {
  readonly name: string;
  rank(candidates: readonly FeedCandidate[], ctx: ViewerContext): readonly RankedCandidate[];
}

// -----------------------------------------------------------------------------
// v1: recency + follows + engagement. Documented weights, deterministic order.
// -----------------------------------------------------------------------------

/** The ranker name, stamped onto the feed response so a swap is visible on the wire. */
const RECENCY_FOLLOWS_ENGAGEMENT_NAME = 'recency-follows-engagement-v1';

/**
 * Recency term: a post is worth {@link RECENCY_WEIGHT} points when brand new and
 * HALVES every {@link RECENCY_HALF_LIFE_HOURS} — a 24-hour half-life, so a
 * day-old post keeps half its recency pull, a two-day-old post a quarter.
 */
const RECENCY_WEIGHT = 100;
const RECENCY_HALF_LIFE_HOURS = 24;

/** Follows term: a flat bump when the viewer follows the creator — people the
 * viewer chose to see beat strangers at equal freshness (~140 vs ~100 fresh). */
const FOLLOWED_CREATOR_BONUS = 40;

/**
 * Engagement term: {@link ENGAGEMENT_WEIGHT}·ln(1 + likes + 2·saves). A SAVE is
 * worth two likes (it's the stronger intent), and the natural-log damping means
 * runaway counts can't swamp recency — a 10k-like week-old post still loses to
 * today's followed post. `ln(1 + x)` is 0 at zero engagement, so a fresh post
 * with no likes yet isn't penalized.
 */
const ENGAGEMENT_WEIGHT = 10;
const SAVE_WEIGHT = 2;

/** Milliseconds per hour — for the age term. */
const MS_PER_HOUR = 1000 * 60 * 60;

/**
 * A candidate's age in hours at `now`, clamped at 0 so a future-dated post (clock
 * skew, a createdAt ahead of `now`) reads as brand new rather than scoring above
 * the recency ceiling. A malformed timestamp (unparseable createdAt or now) also
 * degrades to age 0 rather than throwing — the ranker is total.
 */
function ageHours(createdAt: string, now: string): number {
  const createdMs = Date.parse(createdAt);
  const nowMs = Date.parse(now);
  if (!Number.isFinite(createdMs) || !Number.isFinite(nowMs)) {
    return 0;
  }
  return Math.max(0, (nowMs - createdMs) / MS_PER_HOUR);
}

/**
 * The v1 score for one candidate:
 *   `100·0.5^(ageHours/24) + (isFollowedCreator ? 40 : 0) + 10·ln(1 + likes + 2·saves)`
 * Recency decays on a 24-hour half-life; a followed creator gets a flat +40; and
 * engagement is ln-damped so it informs order without dominating it. Negative
 * counts (never expected from a COUNT) are floored at 0 by the same `ln(1 + x)`
 * guard so the log stays finite.
 */
function scoreCandidate(candidate: FeedCandidate, now: string): number {
  const recency = RECENCY_WEIGHT * Math.pow(0.5, ageHours(candidate.createdAt, now) / RECENCY_HALF_LIFE_HOURS);
  const follows = candidate.isFollowedCreator ? FOLLOWED_CREATOR_BONUS : 0;
  const engagementRaw = Math.max(0, candidate.likeCount + SAVE_WEIGHT * candidate.saveCount);
  const engagement = ENGAGEMENT_WEIGHT * Math.log(1 + engagementRaw);
  return recency + follows + engagement;
}

/**
 * Construct the v1 ranker. Pure and total: it reads only the candidates and
 * `ctx.now`, never the clock or the network.
 *
 * Order is score DESCENDING, with a fully-specified tie-break chain so the order
 * is total and stable even when scores collide: score desc → `createdAt` desc
 * (newer first) → `postId` desc. The `postId` tail guarantees a deterministic
 * order for two posts sharing a score and a timestamp, so paging never reshuffles.
 */
export function createRecencyFollowsEngagementRanker(): FeedRanker {
  return {
    name: RECENCY_FOLLOWS_ENGAGEMENT_NAME,
    rank(candidates: readonly FeedCandidate[], ctx: ViewerContext): readonly RankedCandidate[] {
      const scored = candidates.map((candidate): RankedCandidate => ({
        candidate,
        score: scoreCandidate(candidate, ctx.now),
      }));

      return scored.sort((a, b) => {
        if (b.score !== a.score) {
          return b.score - a.score;
        }
        // Tie-break 1: newer post first (createdAt descending).
        if (a.candidate.createdAt !== b.candidate.createdAt) {
          return a.candidate.createdAt < b.candidate.createdAt ? 1 : -1;
        }
        // Tie-break 2: postId descending — total, stable, deterministic.
        if (a.candidate.postId !== b.candidate.postId) {
          return a.candidate.postId < b.candidate.postId ? 1 : -1;
        }
        return 0;
      });
    },
  };
}
