/**
 * Server-only helpers for post engagement: the shared "can this viewer touch this
 * post?" gate plus the idempotent like / save writes and their live counts.
 *
 * {@link loadPostForViewer} is the ONE gate that like, save, and shop-similar all
 * pass through: the post must exist AND its creator must not be blocked in either
 * direction. A blocked creator's post is indistinguishable from a missing one
 * (both → the routes' 404), so a block leaks nothing — you cannot even confirm the
 * post is there.
 *
 * Counts are live COUNT(*) over the composite-PK index (no denormalized counter —
 * same drift-avoidance posture as follows-server.ts). Writes are single-statement
 * and idempotent (`onConflictDoNothing` on the (post, user) PK; scoped deletes).
 * Never import from a client bundle — it talks to the database.
 */
import { and, count, eq } from 'drizzle-orm';

import { type DbClient, type FeedPost, feedPosts, postLikes, postSaves } from '@era/db';

import { isBlockedEitherWay } from './blocks-server.ts';

/**
 * Load a post for a viewer, applying the block gate. Returns the post row when it
 * exists AND the viewer is not blocked-either-way from its creator; otherwise
 * null — which every caller maps to 404, so a blocked creator's post and a
 * genuinely absent post are indistinguishable to the client (no block oracle).
 *
 * `viewerId` may be null (anonymous): the block check short-circuits to
 * "not blocked", so an anon viewer sees any existing post. Shared by
 * like/unlike, save/unsave, and shop-similar.
 */
export async function loadPostForViewer(db: DbClient, postId: string, viewerId: string | null): Promise<FeedPost | null> {
  const [post] = await db.select().from(feedPosts).where(eq(feedPosts.id, postId)).limit(1);
  if (!post) {
    return null;
  }
  if (await isBlockedEitherWay(db, post.userId, viewerId)) {
    return null;
  }
  return post;
}

/**
 * Like `postId` as `userId`, idempotently. A repeat like is dropped by the
 * composite-PK `onConflictDoNothing`, so the toggle can fire freely. The caller
 * MUST have passed {@link loadPostForViewer} first (existence + block gate).
 */
export async function likePost(db: DbClient, postId: string, userId: string): Promise<void> {
  await db.insert(postLikes).values({ postId, userId }).onConflictDoNothing();
}

/** Remove the viewer's like — a scoped delete, no-op when absent. */
export async function unlikePost(db: DbClient, postId: string, userId: string): Promise<void> {
  await db.delete(postLikes).where(and(eq(postLikes.postId, postId), eq(postLikes.userId, userId)));
}

/**
 * Save `postId` as `userId`, idempotently (composite-PK `onConflictDoNothing`).
 * Same gate contract as {@link likePost}.
 */
export async function savePost(db: DbClient, postId: string, userId: string): Promise<void> {
  await db.insert(postSaves).values({ postId, userId }).onConflictDoNothing();
}

/** Remove the viewer's save — a scoped delete, no-op when absent. */
export async function unsavePost(db: DbClient, postId: string, userId: string): Promise<void> {
  await db.delete(postSaves).where(and(eq(postSaves.postId, postId), eq(postSaves.userId, userId)));
}

/** Live count of likes on `postId` (COUNT(*) over the composite-PK index). */
export async function countLikes(db: DbClient, postId: string): Promise<number> {
  const [row] = await db.select({ n: count() }).from(postLikes).where(eq(postLikes.postId, postId));
  return Number(row?.n ?? 0);
}

/** Live count of saves on `postId` (COUNT(*) over the composite-PK index). */
export async function countSaves(db: DbClient, postId: string): Promise<number> {
  const [row] = await db.select({ n: count() }).from(postSaves).where(eq(postSaves.postId, postId));
  return Number(row?.n ?? 0);
}
