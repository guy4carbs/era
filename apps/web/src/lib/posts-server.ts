/**
 * Server-only helpers for the write side of the feed: sharing an outfit or era
 * to the feed, unsharing it, the per-user daily post cap, and the ownership
 * lookups those gate on. Sharing is a CONSENT act — a post is the publicity grant
 * for its subject — so every write here is scoped to the caller's own outfit/era.
 *
 * Same posture as follows-server.ts: single-statement idempotent writes
 * (`onConflictDoNothing` against the partial unique index), a durable daily cap
 * counted live over the caller's own rows, no denormalized state. Never import
 * from a client bundle — it talks to the database.
 */
import { and, count, eq, gte } from 'drizzle-orm';

import { type DbClient, type FeedPost, eras, feedPosts, outfits } from '@era/db';

/**
 * Per-user cap on NEW posts over a rolling 24-hour window. A generous ceiling
 * that still bounds automated spam-posting; the partial unique index already
 * stops a subject being double-posted, so this bounds distinct fresh shares.
 * Unshare is never capped.
 */
export const MAX_POSTS_PER_DAY = 20;

/** The post-cap window: one rolling day, in milliseconds. */
const POST_WINDOW_MS = 24 * 60 * 60 * 1000;

/** The post rate-limit verdict — mirrors {@link FollowLimitCheck}'s shape. */
export interface PostLimitCheck {
  readonly allowed: boolean;
  readonly used: number;
  readonly limit: number;
}

/**
 * Count the caller's recent posts and decide whether one more is allowed. `used`
 * is the number of `feed_posts` rows `userId` CREATED since the start of the
 * rolling 24h window (indexed `feed_posts_user_id_created_at_idx`); `limit` is
 * {@link MAX_POSTS_PER_DAY}; `allowed` is `used < limit`. Called BEFORE the
 * insert — a false `allowed` makes POST return 429. `now` is injectable so tests
 * can pin the window.
 */
export async function checkPostLimit(db: DbClient, userId: string, now: Date = new Date()): Promise<PostLimitCheck> {
  const since = new Date(now.getTime() - POST_WINDOW_MS);
  const [row] = await db
    .select({ n: count() })
    .from(feedPosts)
    .where(and(eq(feedPosts.userId, userId), gte(feedPosts.createdAt, since)));
  const used = Number(row?.n ?? 0);
  return { allowed: used < MAX_POSTS_PER_DAY, used, limit: MAX_POSTS_PER_DAY };
}

/** True when `outfitId` names an outfit owned by `userId`. */
export async function ownsOutfit(db: DbClient, userId: string, outfitId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: outfits.id })
    .from(outfits)
    .where(and(eq(outfits.id, outfitId), eq(outfits.userId, userId)))
    .limit(1);
  return row !== undefined;
}

/** True when `eraId` names an era owned by `userId`. */
export async function ownsEra(db: DbClient, userId: string, eraId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: eras.id })
    .from(eras)
    .where(and(eq(eras.id, eraId), eq(eras.userId, userId)))
    .limit(1);
  return row !== undefined;
}

/** The subject of a share: exactly one of outfit / era (validated by the caller). */
export type ShareSubject = { outfitId: string; eraId?: undefined } | { eraId: string; outfitId?: undefined };

/**
 * Share an outfit or era to the feed, IDEMPOTENTLY. The insert targets the
 * partial unique index (one live post per subject) with `onConflictDoNothing`, so
 * a repeat share of a still-shared subject writes nothing and this returns the
 * EXISTING live post — the route answers 200 either way, never a duplicate.
 * Re-sharing AFTER an unshare mints a fresh post (the unique row was deleted), so
 * engagement resets, which is the intended "new post" semantics.
 *
 * The caller MUST have verified ownership of the subject first (see
 * {@link ownsOutfit} / {@link ownsEra}); this does not re-check.
 */
export async function sharePost(db: DbClient, userId: string, subject: ShareSubject): Promise<FeedPost> {
  const outfitId = 'outfitId' in subject ? subject.outfitId : null;
  const eraId = 'eraId' in subject ? subject.eraId : null;

  const [inserted] = await db
    .insert(feedPosts)
    .values({ userId, outfitId, eraId })
    .onConflictDoNothing()
    .returning();
  if (inserted) {
    return inserted;
  }

  // Conflict: a live post already exists for this subject (the partial unique
  // index rejected the insert). Return it so the caller responds 200 idempotently.
  // The row is present at conflict time; the assertion satisfies
  // noUncheckedIndexedAccess (a concurrent unshare between the conflict and this
  // read is the caller's own action and not a real concern).
  const [existing] = await db
    .select()
    .from(feedPosts)
    .where(outfitId ? eq(feedPosts.outfitId, outfitId) : eq(feedPosts.eraId, eraId as string))
    .limit(1);
  return existing!;
}

/**
 * Unshare a post — a scoped, owner-only delete. A no-op when the id doesn't
 * exist or isn't the caller's (matches zero rows), so the route can answer
 * `{ deleted: true }` idempotently. The FK cascade tears down the post's likes
 * and saves. Uncapped.
 */
export async function unsharePost(db: DbClient, userId: string, postId: string): Promise<void> {
  await db.delete(feedPosts).where(and(eq(feedPosts.id, postId), eq(feedPosts.userId, userId)));
}

/** The subject type a post shares, derived from which subject column is set. */
export type FeedPostType = 'outfit' | 'era';

/** The compact post shape the write routes echo back (no counts, no cover). */
export interface FeedPostLite {
  readonly id: string;
  readonly type: FeedPostType;
  readonly createdAt: string;
}

/**
 * Project a stored post row to the lite wire shape the POST /api/posts response
 * carries. `type` is derived from the non-null subject column (the CHECK
 * guarantees exactly one is set). `createdAt` is serialized to ISO — the wire has
 * no Date.
 */
export function toFeedPostLite(post: FeedPost): FeedPostLite {
  return {
    id: post.id,
    type: post.outfitId !== null ? 'outfit' : 'era',
    createdAt: post.createdAt.toISOString(),
  };
}
