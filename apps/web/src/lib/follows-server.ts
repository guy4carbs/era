/**
 * Server-only helpers for the follow graph: username→user resolution, live
 * follower/following counts, the viewer's "am I following?" edge check, and the
 * idempotent follow / unfollow writes. Shared by the `/api/follows` routes and
 * the public-profile loader so both compute counts the same way.
 *
 * SCALE NOTE: counts are computed LIVE with `COUNT(*)` over the indexed
 * `follows` columns (`follows_followee_id_idx` for followers,
 * `follows_follower_id_idx` for following) — there are NO denormalized counter
 * columns this phase. That keeps writes single-row and avoids counter drift;
 * if follower counts ever get hot enough to matter, the fix is a cached/
 * denormalized counter, not a schema change here.
 *
 * Never import from a client bundle — it talks to the database.
 */
import { and, count, eq } from 'drizzle-orm';

import { type DbClient, follows, profiles } from '@era/db';

/**
 * Resolve a username to its owning user id, or null when no such profile
 * exists. Case-sensitive: usernames are stored lowercase and validated to a
 * lowercase charset, so an exact match is correct.
 */
export async function resolveUserIdByUsername(db: DbClient, username: string): Promise<string | null> {
  const [row] = await db
    .select({ userId: profiles.userId })
    .from(profiles)
    .where(eq(profiles.username, username))
    .limit(1);
  return row?.userId ?? null;
}

/** Live count of accounts following `userId` (i.e. edges pointing AT them). */
export async function countFollowers(db: DbClient, userId: string): Promise<number> {
  const [row] = await db.select({ n: count() }).from(follows).where(eq(follows.followeeId, userId));
  return Number(row?.n ?? 0);
}

/** Live count of accounts `userId` follows (i.e. edges pointing FROM them). */
export async function countFollowing(db: DbClient, userId: string): Promise<number> {
  const [row] = await db.select({ n: count() }).from(follows).where(eq(follows.followerId, userId));
  return Number(row?.n ?? 0);
}

/**
 * True when `viewerId` currently follows `targetId`. Always false when the
 * viewer is anonymous (`null`) — an anonymous caller follows no one.
 */
export async function isFollowing(db: DbClient, viewerId: string | null, targetId: string): Promise<boolean> {
  if (viewerId === null) {
    return false;
  }
  const [row] = await db
    .select({ followerId: follows.followerId })
    .from(follows)
    .where(and(eq(follows.followerId, viewerId), eq(follows.followeeId, targetId)))
    .limit(1);
  return row !== undefined;
}

/**
 * Create the `followerId → followeeId` edge. Idempotent: a re-follow of the same
 * pair is dropped by the composite primary key via `onConflictDoNothing`, so the
 * caller can fire the toggle freely. The caller MUST have authorized that
 * `followerId` is the session user (see `canInsertFollow`).
 */
export async function followUser(db: DbClient, followerId: string, followeeId: string): Promise<void> {
  await db.insert(follows).values({ followerId, followeeId }).onConflictDoNothing();
}

/**
 * Remove the `followerId → followeeId` edge. A no-op when the edge is absent —
 * the scoped delete simply matches zero rows.
 */
export async function unfollowUser(db: DbClient, followerId: string, followeeId: string): Promise<void> {
  await db.delete(follows).where(and(eq(follows.followerId, followerId), eq(follows.followeeId, followeeId)));
}
