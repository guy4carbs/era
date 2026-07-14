/**
 * Server-only helpers for user reports — the moderation-queue write side the App
 * Store requires for UGC. A report targets EITHER a post OR a username; the
 * reported user is ALWAYS resolved server-side and denormalized onto the row so
 * the report survives the post being deleted.
 *
 * BLOCKS DO NOT SHIELD FROM REPORTS. {@link resolveReportTarget} looks a post's
 * creator up directly (no block gate), unlike the engagement gate — a user must be
 * able to report someone they've blocked, and being blocked must not stop a report
 * against you. This is the one place the block filter is deliberately absent.
 *
 * Same posture as follows-server.ts: a durable daily cap counted live over the
 * caller's own rows, single-statement insert. There is no admin UI this phase —
 * rows are reviewed via the DB; `status` defaults to 'pending'. Never import from
 * a client bundle — it talks to the database.
 */
import { and, count, eq, gte } from 'drizzle-orm';

import { type FeedReportReason, type DbClient, feedPosts, feedReports, profiles } from '@era/db';

/** Per-reporter cap on reports over a rolling 24-hour window (abuse brake). */
export const MAX_REPORTS_PER_DAY = 20;

/** Max length of the optional free-text detail (matches the app-cap in the schema doc). */
export const REPORT_DETAIL_MAX = 500;

/** The report-cap window: one rolling day, in milliseconds. */
const REPORT_WINDOW_MS = 24 * 60 * 60 * 1000;

/** The report rate-limit verdict — mirrors {@link FollowLimitCheck}'s shape. */
export interface ReportLimitCheck {
  readonly allowed: boolean;
  readonly used: number;
  readonly limit: number;
}

/**
 * Count the caller's recent reports and decide whether one more is allowed.
 * `used` counts `feed_reports` rows `reporterId` created since the start of the
 * rolling 24h window (indexed `feed_reports_reporter_id_created_at_idx`); a false
 * `allowed` makes POST return 429. `now` is injectable so tests can pin the
 * window.
 */
export async function checkReportLimit(db: DbClient, reporterId: string, now: Date = new Date()): Promise<ReportLimitCheck> {
  const since = new Date(now.getTime() - REPORT_WINDOW_MS);
  const [row] = await db
    .select({ n: count() })
    .from(feedReports)
    .where(and(eq(feedReports.reporterId, reporterId), gte(feedReports.createdAt, since)));
  const used = Number(row?.n ?? 0);
  return { allowed: used < MAX_REPORTS_PER_DAY, used, limit: MAX_REPORTS_PER_DAY };
}

/** A resolved report target: the reported user, plus the post it hangs off (if any). */
export interface ReportTarget {
  readonly reportedUserId: string;
  readonly postId: string | null;
}

/**
 * Resolve a report's target to a concrete user id, server-side. Exactly one of
 * `postId` / `username` is expected (the route validates the exactly-one rule);
 * this resolves whichever is present:
 *
 *   - `postId` → the post's CREATOR, looked up directly with NO block gate (a
 *     block must not shield its owner from being reported). Returns null when the
 *     post doesn't exist. `postId` is carried onto the row.
 *   - `username` → the profile's user id (a profile report, no post). Returns null
 *     when the username owns no account.
 *
 * A null return means "unknown target" → the route answers 400 `unknown`.
 */
export async function resolveReportTarget(db: DbClient, input: { postId?: string; username?: string }): Promise<ReportTarget | null> {
  if (input.postId !== undefined) {
    const [post] = await db.select({ userId: feedPosts.userId }).from(feedPosts).where(eq(feedPosts.id, input.postId)).limit(1);
    if (!post) {
      return null;
    }
    return { reportedUserId: post.userId, postId: input.postId };
  }

  if (input.username !== undefined) {
    const [profile] = await db.select({ userId: profiles.userId }).from(profiles).where(eq(profiles.username, input.username)).limit(1);
    if (!profile) {
      return null;
    }
    return { reportedUserId: profile.userId, postId: null };
  }

  return null;
}

/** A validated report ready to persist. `reportedUserId` is already resolved. */
export interface CreateReportInput {
  readonly reporterId: string;
  readonly reportedUserId: string;
  readonly postId: string | null;
  readonly reason: FeedReportReason;
  readonly detail: string | null;
}

/**
 * Insert a moderation report. `status` defaults to 'pending' (schema default), and
 * `reportedUserId` is stored denormalized so the row outlives the post (whose
 * `postId` goes null via ON DELETE SET NULL). Single statement, no conflict target
 * — every report is a distinct row (a user may report the same post twice; the
 * daily cap, not a unique index, is the abuse brake).
 */
export async function createReport(db: DbClient, input: CreateReportInput): Promise<void> {
  await db.insert(feedReports).values({
    reporterId: input.reporterId,
    reportedUserId: input.reportedUserId,
    postId: input.postId,
    reason: input.reason,
    detail: input.detail,
  });
}
