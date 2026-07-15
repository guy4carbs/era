/**
 * @era/core — the Feed wire contract. Client-safe types, ZERO logic.
 *
 * This module is the single shared surface across the three tiers of the feed:
 * the server (`apps/web/src/lib/feed-server.ts`) ASSEMBLES a {@link FeedPostPayload}
 * per post — resolving the cover URL, the creator card, live like/save counts, and
 * the viewer's own liked/saved/following bits — and both clients (Nova's web
 * FeedList and Harbor's mobile pager) CONSUME exactly this shape. Pinning the
 * contract here means a field can't drift between the query that fills it and the
 * card that renders it: change the shape once, both ends move together.
 *
 * Deliberately image-free of storage keys and dependency-light (no db, no R2, no
 * zod) so it is safe in a client bundle. The server does the privacy-aware
 * resolution; the payload carries only already-public URLs and counts.
 *
 * Import via the `@era/core/feed` subpath.
 */

/**
 * A postable subject. An `outfit` post shares one saved look; an `era` post
 * shares a named style chapter (a group of outfits). Both render as feed cards;
 * the two-value union lets a client pick the right chrome without a second field.
 */
export type FeedPostType = 'outfit' | 'era';

/**
 * The creator card on a post — who shared it. `username` is the stable handle a
 * card links to (`/{username}`); `displayName` and `avatarUrl` are nullable
 * because a fresh profile may carry neither yet. No follower counts or bio here:
 * the feed card names the creator, the profile page tells the rest.
 */
export interface FeedPostCreator {
  readonly username: string;
  readonly displayName: string | null;
  readonly avatarUrl: string | null;
}

/**
 * The viewer's own relationship to a post — the three bits a card needs to render
 * its like/save/follow controls in their resting state without a second lookup.
 * Server-resolved per request against the viewer's identity; all false for a
 * signed-out (or non-interacting) viewer.
 */
export interface FeedPostViewerState {
  readonly liked: boolean;
  readonly saved: boolean;
  readonly following: boolean;
}

/**
 * One fully-assembled feed card. The server resolves every field with the
 * viewer's identity in hand, so a client renders a card straight from this with
 * no follow-up query. `coverUrl` and `title` are nullable — a look may still be
 * missing its cover, and an era need not be titled — and a client shows its
 * placeholder rather than assuming they're present. `createdAt` is an ISO-8601
 * string (the wire has no Date type); counts are live COUNT(*) values, never a
 * denormalized counter.
 */
export interface FeedPostPayload {
  readonly id: string;
  readonly type: FeedPostType;
  readonly coverUrl: string | null;
  readonly title: string | null;
  readonly creator: FeedPostCreator;
  readonly likeCount: number;
  readonly saveCount: number;
  readonly viewer: FeedPostViewerState;
  readonly createdAt: string;
}

/**
 * One page of the feed. `posts` is the ranked window the server assembled;
 * `nextCursor` is the opaque keyset cursor for the next page (`null` at the end,
 * so a client stops paginating); `ranker` names the {@link FeedRanker} that
 * ordered this page (echoed back so the response is self-describing and a
 * swapped-in recommender is observable in the payload).
 */
export interface FeedPage {
  readonly posts: readonly FeedPostPayload[];
  readonly nextCursor: string | null;
  readonly ranker: string;
}

/**
 * Why a viewer reported a post or a profile. A closed union so the moderation
 * queue and the report form agree on the same four buckets; `other` is the
 * catch-all that pairs with a free-text detail. Mirrors the `feed_reports.reason`
 * pg enum in `@era/db` — keep the two in lockstep.
 */
export type ReportReason = 'spam' | 'inappropriate' | 'impersonation' | 'other';

/**
 * The report reasons as an ordered tuple — the ONE source of truth both the
 * report form (chip order) and {@link isReportReason} read, so a new reason is
 * added in exactly one place.
 */
export const REPORT_REASONS = ['spam', 'inappropriate', 'impersonation', 'other'] as const;

/**
 * Narrow an untrusted value (a request body field) to a {@link ReportReason}.
 * Pure, total, never throws — the API route validates the wire input through this
 * before it reaches the DB enum.
 */
export function isReportReason(value: unknown): value is ReportReason {
  return typeof value === 'string' && (REPORT_REASONS as readonly string[]).includes(value);
}

/**
 * The page size for one feed request: the candidate stream is ordered
 * `(created_at DESC, id DESC)` and sliced into windows of this many posts, each
 * window handed to the {@link FeedRanker}. Ranking is WITHIN a page (honest v1
 * limit — see the plan's cursor strategy), so this doubles as the ranking window.
 * Shared by the server (query LIMIT) and the clients (prefetch math).
 */
export const FEED_PAGE_WINDOW = 40;
