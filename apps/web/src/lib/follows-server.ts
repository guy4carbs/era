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
import { and, count, eq, gte } from 'drizzle-orm';

import { type DbClient, follows, profiles } from '@era/db';

/**
 * Per-user follow cap over a rolling 24-hour window. Bounds mass-follow spam —
 * the abuse the `/api/follows` POST guards against — while sitting far above any
 * plausible human follow rate. Enforced by counting the caller's recently
 * created edges (see {@link countRecentFollows}); unfollow is never capped.
 */
export const MAX_FOLLOWS_PER_DAY = 100;

/** The follow-cap window: one rolling day, in milliseconds. */
const FOLLOW_WINDOW_MS = 24 * 60 * 60 * 1000;

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

/** The follow rate-limit verdict — mirrors `checkDailyLimit`'s shape. */
export interface FollowLimitCheck {
  readonly allowed: boolean;
  readonly used: number;
  readonly limit: number;
}

/**
 * Count the caller's recent follows and decide whether one more is allowed.
 * `used` is the number of `follows` rows `followerId` CREATED since the start of
 * the rolling 24h window (indexed `follows_follower_id_idx`, filtered by
 * `created_at`); `limit` is {@link MAX_FOLLOWS_PER_DAY}; `allowed` is
 * `used < limit`. Called BEFORE the insert — a false `allowed` makes POST return
 * 429 instead of writing the edge. `now` is injectable so tests can pin the
 * window.
 *
 * APPROXIMATE BOUND: an unfollow DELETEs a counted row, so follow⇄unfollow churn
 * on a single target shrinks `used`. The cap therefore bounds NET distinct
 * follows in the window (the mass-follow spam vector) rather than total write
 * operations — see the note in `api/follows/route.ts`.
 */
export async function checkFollowLimit(db: DbClient, followerId: string, now: Date = new Date()): Promise<FollowLimitCheck> {
  const since = new Date(now.getTime() - FOLLOW_WINDOW_MS);
  const [row] = await db
    .select({ n: count() })
    .from(follows)
    .where(and(eq(follows.followerId, followerId), gte(follows.createdAt, since)));
  const used = Number(row?.n ?? 0);
  return { allowed: used < MAX_FOLLOWS_PER_DAY, used, limit: MAX_FOLLOWS_PER_DAY };
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
