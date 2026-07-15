/**
 * Server-only helpers for the block graph — the primitive behind bidirectional
 * invisibility. A block is a directed `(blocker → blocked)` edge, but the PRODUCT
 * rule is symmetric: once either user blocks the other, neither may see the other
 * anywhere (feed, profiles, and — when it exists — search). Every read surface
 * therefore checks BOTH directions.
 *
 * The two primitives every future surface leans on:
 *   - {@link isBlockedEitherWay} — the point check (one SELECT, OR of both edges),
 *     used by the like/save/shop-similar gate and the public-profile loader.
 *   - {@link blockedUserIdsFor} — the set of user ids invisible to a viewer (both
 *     directions unioned), used to mask a listing in one pass.
 *
 * SEARCH NOTE: no profile-search surface exists this phase. When one is built it
 * MUST filter its candidates through {@link blockedUserIdsFor} (or the point check
 * per row) — a block that hid a user from the feed but surfaced them in search
 * would leak exactly the presence the block is meant to remove.
 *
 * SCALE NOTE: same posture as follows-server.ts — no denormalized state, the
 * checks are indexed lookups (the composite PK covers "who I blocked"; the
 * `user_blocks_blocked_id_idx` covers "who blocked me"). Never import from a
 * client bundle — it talks to the database.
 */
import { and, count, desc, eq, gte, or } from 'drizzle-orm';

import { type DbClient, follows, profiles, userBlocks } from '@era/db';

/**
 * Per-user block cap over a rolling 24-hour window. Bounds block-spam the same
 * way {@link MAX_FOLLOWS_PER_DAY} bounds follow-spam, sitting far above any
 * plausible human rate. Enforced by counting the caller's recently created block
 * edges (see {@link checkBlockLimit}); unblock is never capped.
 */
export const MAX_BLOCKS_PER_DAY = 50;

/** The block-cap window: one rolling day, in milliseconds. */
const BLOCK_WINDOW_MS = 24 * 60 * 60 * 1000;

/**
 * True when `a` and `b` block each other in EITHER direction. Anonymous viewer
 * (`b === null`) short-circuits to false with NO query — an anonymous caller has
 * no block edges. A single SELECT ORs the two directed edges, so one indexed
 * lookup answers the symmetric question.
 */
export async function isBlockedEitherWay(db: DbClient, a: string, b: string | null): Promise<boolean> {
  if (b === null) {
    return false;
  }
  const [row] = await db
    .select({ blockerId: userBlocks.blockerId })
    .from(userBlocks)
    .where(
      or(
        and(eq(userBlocks.blockerId, a), eq(userBlocks.blockedId, b)),
        and(eq(userBlocks.blockerId, b), eq(userBlocks.blockedId, a)),
      ),
    )
    .limit(1);
  return row !== undefined;
}

/**
 * The set of user ids invisible to `viewerId` — everyone they blocked UNION
 * everyone who blocked them. One SELECT over both directed columns; each row
 * contributes the OTHER party's id. An empty set is the common case (returned
 * without allocation surprises). This is the mask a listing surface (feed, and a
 * future search) applies in a single pass.
 */
export async function blockedUserIdsFor(db: DbClient, viewerId: string): Promise<Set<string>> {
  const rows = await db
    .select({ blockerId: userBlocks.blockerId, blockedId: userBlocks.blockedId })
    .from(userBlocks)
    .where(or(eq(userBlocks.blockerId, viewerId), eq(userBlocks.blockedId, viewerId)));

  const ids = new Set<string>();
  for (const row of rows) {
    if (row.blockerId === viewerId) {
      ids.add(row.blockedId);
    }
    if (row.blockedId === viewerId) {
      ids.add(row.blockerId);
    }
  }
  return ids;
}

/** The block rate-limit verdict — mirrors {@link FollowLimitCheck}'s shape. */
export interface BlockLimitCheck {
  readonly allowed: boolean;
  readonly used: number;
  readonly limit: number;
}

/**
 * Count the caller's recent block edges and decide whether one more is allowed.
 * `used` is the number of `user_blocks` rows `blockerId` CREATED since the start
 * of the rolling 24h window; `limit` is {@link MAX_BLOCKS_PER_DAY}; `allowed` is
 * `used < limit`. Called BEFORE the insert — a false `allowed` makes POST return
 * 429. `now` is injectable so tests can pin the window. Unblock consults no
 * count (uncapped).
 */
export async function checkBlockLimit(db: DbClient, blockerId: string, now: Date = new Date()): Promise<BlockLimitCheck> {
  const since = new Date(now.getTime() - BLOCK_WINDOW_MS);
  const [row] = await db
    .select({ n: count() })
    .from(userBlocks)
    .where(and(eq(userBlocks.blockerId, blockerId), gte(userBlocks.createdAt, since)));
  const used = Number(row?.n ?? 0);
  return { allowed: used < MAX_BLOCKS_PER_DAY, used, limit: MAX_BLOCKS_PER_DAY };
}

/**
 * Block `blockedId` on behalf of `blockerId`, then sever any existing follow edge
 * in BOTH directions so a prior follow can't keep leaking activity past the new
 * block. Three single-statement writes, deliberately NOT wrapped in a transaction
 * (neon-http has none):
 *
 *   1. INSERT the block edge (PK `onConflictDoNothing` → idempotent re-block).
 *   2. DELETE the blocker→blocked follow edge.
 *   3. DELETE the blocked→blocker follow edge.
 *
 * CRASH SEMANTICS: the stricter state (the block) is written FIRST, so a crash
 * between statements can only leave a block in place with a stale follow edge —
 * never the reverse. That residue is harmless: every read filter checks blocks in
 * both directions and masks the pair regardless of a lingering follow row, and a
 * re-run of blockUser (the insert is idempotent) completes the two deletes. The
 * failure mode is "invisible but still technically following", which the filters
 * already hide; the opposite ordering could leave "unfollowed but still visible",
 * which they would not.
 */
export async function blockUser(db: DbClient, blockerId: string, blockedId: string): Promise<void> {
  await db.insert(userBlocks).values({ blockerId, blockedId }).onConflictDoNothing();
  await db.delete(follows).where(and(eq(follows.followerId, blockerId), eq(follows.followeeId, blockedId)));
  await db.delete(follows).where(and(eq(follows.followerId, blockedId), eq(follows.followeeId, blockerId)));
}

/**
 * Remove the `blockerId → blockedId` block edge. A no-op when absent (the scoped
 * delete matches zero rows). Unblocking does NOT restore the severed follow edges
 * — re-following is the user's own action, exactly as an unblock on any social
 * product. Uncapped.
 */
export async function unblockUser(db: DbClient, blockerId: string, blockedId: string): Promise<void> {
  await db.delete(userBlocks).where(and(eq(userBlocks.blockerId, blockerId), eq(userBlocks.blockedId, blockedId)));
}

/** One row of the caller's "Blocked accounts" list — enough to render + unblock. */
export interface BlockedAccount {
  readonly username: string;
  readonly displayName: string | null;
  readonly avatarUrl: string | null;
}

/**
 * List the accounts `viewerId` has blocked (the forward direction only — the ones
 * they can choose to unblock), newest block first, joined to each blocked user's
 * profile for a renderable card. Settings needs this and Apple reviewers look for
 * a visible unblock path. One indexed query over the composite PK; no N+1.
 */
export async function listBlocked(db: DbClient, viewerId: string): Promise<BlockedAccount[]> {
  const rows = await db
    .select({
      username: profiles.username,
      displayName: profiles.displayName,
      avatarUrl: profiles.avatarUrl,
    })
    .from(userBlocks)
    .innerJoin(profiles, eq(profiles.userId, userBlocks.blockedId))
    .where(eq(userBlocks.blockerId, viewerId))
    .orderBy(desc(userBlocks.createdAt));

  return rows.map((row) => ({ username: row.username, displayName: row.displayName, avatarUrl: row.avatarUrl }));
}
