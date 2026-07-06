/**
 * Server-only persistence for the price-alert notification surface: the user's
 * opt-in preferences, their in-app "price dropped" cards, and their device push
 * tokens. Every read/write is owner-scoped — the routes authorize through the
 * `@era/core` `can*NotificationPreferences` / `can*InAppNotification` /
 * `can*PushToken` guards, and these helpers additionally filter by `userId` so a
 * query can only ever touch the caller's own rows. Never import from a client
 * bundle (holds the DB client).
 *
 * Notification cards are written by the server-side price-check job (a parallel
 * owner), not here — this module only reads them back and marks them read.
 */
import { and, desc, eq } from 'drizzle-orm';

import {
  type DbClient,
  type InAppNotification,
  type NewNotificationPreference,
  type NotificationPreference,
  inAppNotifications,
  notificationPreferences,
  pushTokens,
} from '@era/db';

/** The caller-facing preferences shape (every alert channel is opt-in). */
export interface NotificationPreferencesView {
  priceAlertsEnabled: boolean;
  emailAlerts: boolean;
  pushAlerts: boolean;
}

/** A partial update — any omitted channel is left untouched. */
export interface NotificationPreferencesPatch {
  priceAlertsEnabled?: boolean;
  emailAlerts?: boolean;
  pushAlerts?: boolean;
}

/**
 * One in-app notification as the clients consume it. Timestamps are serialized to
 * ISO strings (what actually crosses the wire via `NextResponse.json`) so the
 * client contract is explicit rather than a raw `Date`.
 */
export interface NotificationView {
  id: string;
  kind: string;
  payload: Record<string, unknown>;
  createdAt: string;
  readAt: string | null;
}

/** Defaults for a user with no preferences row yet: everything opt-in, so off. */
const DEFAULT_PREFERENCES: NotificationPreferencesView = {
  priceAlertsEnabled: false,
  emailAlerts: false,
  pushAlerts: false,
};

/** The feed is capped — a user only ever sees their most recent cards. */
const NOTIFICATIONS_LIMIT = 50;

/** Map a stored preferences row to the client-facing shape. */
function toPreferencesView(row: NotificationPreference): NotificationPreferencesView {
  return {
    priceAlertsEnabled: row.priceAlertsEnabled,
    emailAlerts: row.emailAlerts,
    pushAlerts: row.pushAlerts,
  };
}

/** Map a stored notification row to the render-friendly shape (dates → ISO). */
function toNotificationView(row: InAppNotification): NotificationView {
  return {
    id: row.id,
    kind: row.kind,
    // jsonb column — the price-check job writes a JSON object payload.
    payload: row.payload as Record<string, unknown>,
    createdAt: row.createdAt.toISOString(),
    readAt: row.readAt ? row.readAt.toISOString() : null,
  };
}

/**
 * Read `userId`'s alert preferences, or the all-off defaults when no row exists.
 * A user who has never touched settings is treated as opted out of every channel.
 */
export async function getNotificationPreferences(
  db: DbClient,
  userId: string,
): Promise<NotificationPreferencesView> {
  const [row] = await db
    .select()
    .from(notificationPreferences)
    .where(eq(notificationPreferences.userId, userId))
    .limit(1);
  return row ? toPreferencesView(row) : { ...DEFAULT_PREFERENCES };
}

/**
 * Upsert `userId`'s alert preferences and return the full updated row. Only the
 * channels present in `patch` are written; on conflict the existing row is
 * updated in place (the user id is the primary key, so there is exactly one row).
 */
export async function upsertNotificationPreferences(
  db: DbClient,
  userId: string,
  patch: NotificationPreferencesPatch,
): Promise<NotificationPreferencesView> {
  const changes: Partial<NewNotificationPreference> = {};
  if (patch.priceAlertsEnabled !== undefined) changes.priceAlertsEnabled = patch.priceAlertsEnabled;
  if (patch.emailAlerts !== undefined) changes.emailAlerts = patch.emailAlerts;
  if (patch.pushAlerts !== undefined) changes.pushAlerts = patch.pushAlerts;

  const [row] = await db
    .insert(notificationPreferences)
    .values({ userId, ...changes })
    .onConflictDoUpdate({
      target: notificationPreferences.userId,
      set: { ...changes, updatedAt: new Date() },
    })
    .returning();
  return toPreferencesView(row!);
}

/** List `userId`'s in-app notifications, newest first, capped, client-shaped. */
export async function listInAppNotifications(
  db: DbClient,
  userId: string,
): Promise<NotificationView[]> {
  const rows = await db
    .select()
    .from(inAppNotifications)
    .where(eq(inAppNotifications.userId, userId))
    .orderBy(desc(inAppNotifications.createdAt))
    .limit(NOTIFICATIONS_LIMIT);
  return rows.map(toNotificationView);
}

/**
 * Fetch one notification by id (unscoped) so the caller can verify ownership
 * through the authz guard before mutating it. Returns `undefined` when missing.
 */
export async function findInAppNotification(
  db: DbClient,
  id: string,
): Promise<InAppNotification | undefined> {
  const [row] = await db
    .select()
    .from(inAppNotifications)
    .where(eq(inAppNotifications.id, id))
    .limit(1);
  return row;
}

/**
 * Mark `id` read for `userId`. The update is owner-scoped in the `WHERE` clause
 * too, so even without the guard a caller can never flip another user's row.
 */
export async function markInAppNotificationRead(
  db: DbClient,
  userId: string,
  id: string,
): Promise<void> {
  await db
    .update(inAppNotifications)
    .set({ readAt: new Date() })
    .where(and(eq(inAppNotifications.id, id), eq(inAppNotifications.userId, userId)));
}

/**
 * Register a device push token for `userId`. Idempotent: re-registering the same
 * `(userId, token)` is dropped by the unique constraint via `onConflictDoNothing`.
 */
export async function registerPushToken(
  db: DbClient,
  userId: string,
  token: string,
  platform: string,
): Promise<void> {
  await db
    .insert(pushTokens)
    .values({ userId, token, platform })
    .onConflictDoNothing({ target: [pushTokens.userId, pushTokens.token] });
}

/** Remove a device push token from `userId`'s registrations. No-op when absent. */
export async function unregisterPushToken(
  db: DbClient,
  userId: string,
  token: string,
): Promise<void> {
  await db
    .delete(pushTokens)
    .where(and(eq(pushTokens.userId, userId), eq(pushTokens.token, token)));
}
