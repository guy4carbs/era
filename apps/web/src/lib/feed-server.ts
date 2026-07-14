/**
 * Server-only assembly of one feed page — the read model behind GET /api/feed.
 *
 * The shape of a page load, in order:
 *   1. CANDIDATE QUERY — one keyset window over the `(created_at, id) DESC` post
 *      stream: feed_posts LEFT JOINed to its outfit/era subject (title + cover
 *      path) and INNER JOINed to the creator's profile (identity), filtered to
 *      exclude the viewer's own posts and any creator blocked in EITHER direction.
 *   2. BATCHED COUNTS — one grouped COUNT for likes, one for saves, over the page.
 *   3. BATCHED VIEWER STATE — the viewer's own likes and saves among the page's
 *      posts, and the viewer's follow edges among the page's creators.
 *   4. RANK — the page is handed to a {@link FeedRanker} constructed at the ONE
 *      site below; the response echoes `ranker.name`.
 *   5. ASSEMBLE — each post becomes a {@link FeedPostPayload}, cover resolved.
 *
 * Exactly SIX queries per populated page (1 candidate + 2 counts + 3 viewer
 * state) — no per-post lookups. An empty candidate page short-circuits to zero
 * further queries (an empty IN-list is both pointless and invalid SQL).
 *
 * PAGINATION: `nextCursor` is the `(createdAt, id)` of the last row in STREAM
 * order (not ranked order) — ranking reorders within a page but the cursor walks
 * the underlying stream, so pages never dupe or gap. A short page (< the window)
 * means the stream is exhausted → `nextCursor` is null.
 *
 * Never import from a client bundle — it talks to the database and R2.
 */
import { type SQL, and, count, desc, eq, inArray, ne, sql } from 'drizzle-orm';

import { type FeedPage, type FeedPostPayload, FEED_PAGE_WINDOW } from '@era/core/feed';
import { type FeedCandidate, createRecencyFollowsEngagementRanker } from '@era/core/feed-ranking';
import { isEraFeedEnabled } from '@era/core/feed-flags';
import { type AuthContext, type StorageClient } from '@era/core';
import { type DbClient, eras, feedPosts, follows, outfits, postLikes, postSaves, profiles, userBlocks } from '@era/db';

import { type AssetOwner, coverUrl } from './outfit-server.ts';

/**
 * Server-side feed feature flag — delegates to @era/core's canonical
 * `isEraFeedEnabled`, reading `ERA_FEED_ENABLED` raw from the environment (NOT
 * through the zod schema, so a dormant feature never blocks boot — the plus-server
 * precedent). This is the REAL gate: when false the feed API routes 404. The
 * `NEXT_PUBLIC_` / `EXPO_PUBLIC_` variants are cosmetic (they only pick UI).
 */
export function isFeedEnabledServer(): boolean {
  return isEraFeedEnabled(process.env.ERA_FEED_ENABLED);
}

/** A UUID, for strict cursor-id validation. */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A parsed keyset cursor: the `(created_at, id)` of the last stream row seen. */
interface FeedCursor {
  readonly createdAtISO: string;
  readonly id: string;
}

/**
 * Serialize a keyset cursor as `{createdAtISO}|{uuid}`. The ISO instant carries no
 * `|`, so the split in {@link parseCursor} is unambiguous. `createdAt` is a DB
 * Date; it's rendered with `toISOString()` (always UTC 'Z'), which is what the
 * strict parse round-trips against.
 */
export function serializeCursor(createdAt: Date, id: string): string {
  return `${createdAt.toISOString()}|${id}`;
}

/**
 * Parse a cursor string, STRICTLY. Returns null on any garbage — a malformed
 * cursor must not silently page from the top. Valid iff it splits into exactly two
 * `|`-separated parts, the first ROUND-TRIPS through `Date` as a canonical UTC ISO
 * string (rejecting offsets, junk, and non-canonical spellings), and the second is
 * a UUID. The route maps null → 400 `invalid`.
 */
export function parseCursor(raw: string): FeedCursor | null {
  const parts = raw.split('|');
  const createdAtISO = parts[0];
  const id = parts[1];
  if (parts.length !== 2 || createdAtISO === undefined || id === undefined) {
    return null;
  }
  const parsed = new Date(createdAtISO);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString() !== createdAtISO) {
    return null;
  }
  if (!UUID_RE.test(id)) {
    return null;
  }
  return { createdAtISO, id };
}

/**
 * The WHERE conditions for the candidate query, exposed as a list so the
 * block-filter and keyset bound are individually testable (and so the query reads
 * as a single `and(...filters)`). Always: exclude the viewer's OWN posts, and
 * exclude any creator blocked in EITHER direction (bidirectional invisibility,
 * pushed into SQL via NOT EXISTS so a blocked creator never enters the page). With
 * a cursor, add the keyset bound `(created_at, id) < cursor` over the composite
 * index. Without a cursor (page 1) there are exactly two filters; with one, three.
 */
export function feedCandidateFilters(viewerId: string, cursor: FeedCursor | null): SQL[] {
  const notBlocked = sql`not exists (
    select 1 from ${userBlocks}
    where (${userBlocks.blockerId} = ${feedPosts.userId} and ${userBlocks.blockedId} = ${viewerId})
       or (${userBlocks.blockerId} = ${viewerId} and ${userBlocks.blockedId} = ${feedPosts.userId})
  )`;
  const filters: SQL[] = [ne(feedPosts.userId, viewerId), notBlocked];
  if (cursor) {
    filters.push(sql`(${feedPosts.createdAt}, ${feedPosts.id}) < (${cursor.createdAtISO}::timestamptz, ${cursor.id}::uuid)`);
  }
  return filters;
}

/** One row of the candidate query, in stream `(created_at, id) DESC` order. */
interface CandidateRow {
  readonly id: string;
  readonly creatorId: string;
  readonly createdAt: Date;
  readonly outfitId: string | null;
  readonly eraId: string | null;
  readonly outfitName: string | null;
  readonly outfitCover: string | null;
  readonly eraTitle: string | null;
  readonly eraCover: string | null;
  readonly username: string;
  readonly displayName: string | null;
  readonly avatarUrl: string | null;
}

/**
 * Load and assemble one page of the feed for `viewerId`. `cursor` is the opaque
 * string from the previous page (null for page 1); `now` is injected so ranking
 * (which decays by age) is deterministic in tests. See the module doc for the
 * six-query shape and the stream-order cursor contract.
 *
 * The caller resolves `cursor` validity: an INVALID cursor string should be
 * rejected upstream (the route parses it and 400s). This function treats a null
 * cursor as "from the top" and a parsed cursor as the keyset bound.
 */
export async function loadFeedPage(
  db: DbClient,
  storage: StorageClient,
  viewerId: string,
  cursor: FeedCursor | null,
  now: Date = new Date(),
): Promise<FeedPage> {
  const ranker = createRecencyFollowsEngagementRanker();

  // 1) Candidate window. The filters (own-posts exclusion, bidirectional block
  //    NOT EXISTS, and the optional keyset bound) are built by
  //    feedCandidateFilters; the query is a single and(...) over them, ordered by
  //    the composite `(created_at, id)` index descending.
  const rows = (await db
    .select({
      id: feedPosts.id,
      creatorId: feedPosts.userId,
      createdAt: feedPosts.createdAt,
      outfitId: feedPosts.outfitId,
      eraId: feedPosts.eraId,
      outfitName: outfits.name,
      outfitCover: outfits.coverImagePath,
      eraTitle: eras.title,
      eraCover: eras.coverImagePath,
      username: profiles.username,
      displayName: profiles.displayName,
      avatarUrl: profiles.avatarUrl,
    })
    .from(feedPosts)
    .leftJoin(outfits, eq(feedPosts.outfitId, outfits.id))
    .leftJoin(eras, eq(feedPosts.eraId, eras.id))
    .innerJoin(profiles, eq(profiles.userId, feedPosts.userId))
    .where(and(...feedCandidateFilters(viewerId, cursor)))
    .orderBy(desc(feedPosts.createdAt), desc(feedPosts.id))
    .limit(FEED_PAGE_WINDOW)) as CandidateRow[];

  if (rows.length === 0) {
    return { posts: [], nextCursor: null, ranker: ranker.name };
  }

  const postIds = rows.map((row) => row.id);
  const creatorIds = [...new Set(rows.map((row) => row.creatorId))];

  // 2) Batched engagement counts — one grouped COUNT each over the page.
  const likeRows = await db
    .select({ postId: postLikes.postId, n: count() })
    .from(postLikes)
    .where(inArray(postLikes.postId, postIds))
    .groupBy(postLikes.postId);
  const saveRows = await db
    .select({ postId: postSaves.postId, n: count() })
    .from(postSaves)
    .where(inArray(postSaves.postId, postIds))
    .groupBy(postSaves.postId);
  const likeCountByPost = new Map(likeRows.map((r) => [r.postId, Number(r.n)]));
  const saveCountByPost = new Map(saveRows.map((r) => [r.postId, Number(r.n)]));

  // 3) Batched viewer state — the viewer's own likes/saves among the page, and
  //    the viewer's follow edges among the page's creators.
  const viewerLikeRows = await db
    .select({ postId: postLikes.postId })
    .from(postLikes)
    .where(and(eq(postLikes.userId, viewerId), inArray(postLikes.postId, postIds)));
  const viewerSaveRows = await db
    .select({ postId: postSaves.postId })
    .from(postSaves)
    .where(and(eq(postSaves.userId, viewerId), inArray(postSaves.postId, postIds)));
  const viewerFollowRows = await db
    .select({ followeeId: follows.followeeId })
    .from(follows)
    .where(and(eq(follows.followerId, viewerId), inArray(follows.followeeId, creatorIds)));
  const likedPosts = new Set(viewerLikeRows.map((r) => r.postId));
  const savedPosts = new Set(viewerSaveRows.map((r) => r.postId));
  const followedCreators = new Set(viewerFollowRows.map((r) => r.followeeId));

  // 4) Rank. Build one candidate per stream row; the ranker orders them.
  const candidates: FeedCandidate[] = rows.map((row) => ({
    postId: row.id,
    creatorId: row.creatorId,
    createdAt: row.createdAt.toISOString(),
    likeCount: likeCountByPost.get(row.id) ?? 0,
    saveCount: saveCountByPost.get(row.id) ?? 0,
    isFollowedCreator: followedCreators.has(row.creatorId),
  }));
  const ranked = ranker.rank(candidates, { viewerId, now: now.toISOString() });

  // 5) Assemble the payloads in RANKED order, resolving each cover.
  const rowById = new Map(rows.map((row) => [row.id, row]));
  const ctx: AuthContext = { userId: viewerId };

  const posts: FeedPostPayload[] = await Promise.all(
    ranked.map(async ({ candidate }): Promise<FeedPostPayload> => {
      const row = rowById.get(candidate.postId)!;
      const isOutfit = row.outfitId !== null;

      // THE ONE DELIBERATE PRIVACY-BIT OVERRIDE. The subject's cover is resolved
      // with `owner.isPrivate = false` REGARDLESS of the creator's actual profile
      // privacy: posting to the feed IS the publicity grant. A private-profile
      // user who shares a look consents to that look being public (their identity
      // is already public via the private-profile card); flipping the profile
      // private later does NOT retract an existing post — unshare is the
      // retraction. So the cover resolves to an unsigned public URL here even for
      // a private creator, and that is intended, not a leak.
      const owner: AssetOwner = { userId: row.creatorId, isPrivate: false };
      const coverPath = isOutfit ? row.outfitCover : row.eraCover;

      return {
        id: row.id,
        type: isOutfit ? 'outfit' : 'era',
        coverUrl: await coverUrl(storage, ctx, coverPath, owner),
        title: isOutfit ? row.outfitName : row.eraTitle,
        creator: { username: row.username, displayName: row.displayName, avatarUrl: row.avatarUrl },
        likeCount: candidate.likeCount,
        saveCount: candidate.saveCount,
        viewer: {
          liked: likedPosts.has(row.id),
          saved: savedPosts.has(row.id),
          following: followedCreators.has(row.creatorId),
        },
        createdAt: candidate.createdAt,
      };
    }),
  );

  // Cursor walks the STREAM, not the ranked order. A full window means there may
  // be more; a short page means the stream is exhausted.
  // rows is non-empty here (the empty page returned above), so the last row is
  // defined; the assertion satisfies noUncheckedIndexedAccess.
  const lastStreamRow = rows[rows.length - 1]!;
  const nextCursor = rows.length === FEED_PAGE_WINDOW ? serializeCursor(lastStreamRow.createdAt, lastStreamRow.id) : null;

  return { posts, nextCursor, ranker: ranker.name };
}
