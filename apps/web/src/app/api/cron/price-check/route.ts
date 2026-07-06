/**
 * POST /api/cron/price-check
 *
 * The scheduled price-drop sweep for Shop. NOT session-guarded — it runs from a
 * scheduler, not a browser — so it is protected by a shared secret: the caller
 * must send `x-cron-secret` matching `CRON_SECRET`. The secret is OPTIONAL and
 * the route is DORMANT until it is provisioned: with `CRON_SECRET` unset (or the
 * committed `change-me-…` placeholder) every call gets 503 and no work runs, so
 * the endpoint is inert on a fresh deploy.
 *
 * On an authorized call it loads every opted-in watch row (saved products of
 * users with `price_alerts_enabled`), fetches each current price, records the
 * check, and dispatches on a genuine price drop — the drop rule, channel fan-out,
 * and per-row isolation all live in `lib/price-check.ts`. This route only owns
 * the secret gate and the DB-backed seams.
 *
 * Responses:
 *   - 503 { error: 'cron not configured' }   CRON_SECRET unset/placeholder
 *   - 401 { error: 'unauthorized' }          header missing or wrong
 *   - 500 { error: 'price_check_failed' }    the batch itself failed to start
 *   - 200 { checked, dropped, alertsSent }
 */
import { NextResponse } from 'next/server';

import { and, desc, eq } from 'drizzle-orm';

import {
  createDbClient,
  inAppNotifications,
  notificationPreferences,
  pushTokens,
  savedProducts,
  user,
  type SavedProduct,
} from '@era/db';

import {
  authorizeCron,
  runPriceCheck,
  type PriceDropPayload,
  type PriceWatchRow,
} from '../../../../lib/price-check.ts';
import { sendPriceDropEmail } from '../../../../lib/send-price-drop-email.ts';
import { sendExpoPush, type ExpoPushMessage } from '../../../../lib/expo-push.ts';

const db = createDbClient(process.env.DATABASE_URL!);

/**
 * Load up to `cap` watch rows: one row per saved product whose owner has price
 * alerts enabled, carrying the owner's per-channel opt-ins and email. The
 * `price_alerts_enabled` filter is the master switch — a user who never enabled
 * alerts contributes zero rows, so no price check ever touches their saves.
 */
async function loadRows(cap: number): Promise<readonly PriceWatchRow[]> {
  const rows = await db
    .select({
      saved: savedProducts,
      emailAlerts: notificationPreferences.emailAlerts,
      pushAlerts: notificationPreferences.pushAlerts,
      userEmail: user.email,
    })
    .from(savedProducts)
    .innerJoin(notificationPreferences, eq(notificationPreferences.userId, savedProducts.userId))
    .innerJoin(user, eq(user.id, savedProducts.userId))
    .where(eq(notificationPreferences.priceAlertsEnabled, true))
    .orderBy(desc(savedProducts.createdAt))
    .limit(cap);

  return rows.map((row) => ({
    saved: row.saved satisfies SavedProduct,
    emailAlerts: row.emailAlerts,
    pushAlerts: row.pushAlerts,
    userEmail: row.userEmail,
  }));
}

/** Stamp the check: always `lastCheckedAt`; set `lastPriceCents` only when priced. */
async function recordCheck(savedId: string, currentCents: number | null, checkedAt: Date): Promise<void> {
  const patch: { lastCheckedAt: Date; lastPriceCents?: number } = { lastCheckedAt: checkedAt };
  if (currentCents !== null) {
    patch.lastPriceCents = currentCents;
  }
  await db.update(savedProducts).set(patch).where(eq(savedProducts.id, savedId));
}

/** Insert the in-app `price_drop` card. */
async function insertNotification(userId: string, payload: PriceDropPayload): Promise<void> {
  await db.insert(inAppNotifications).values({ userId, kind: 'price_drop', payload });
}

/** The user's registered Expo push tokens (empty when none registered). */
async function loadPushTokens(userId: string): Promise<readonly string[]> {
  const rows = await db
    .select({ token: pushTokens.token })
    .from(pushTokens)
    .where(and(eq(pushTokens.userId, userId)));
  return rows.map((row) => row.token);
}

export async function POST(request: Request): Promise<NextResponse> {
  const auth = authorizeCron(request, process.env);
  if (auth === 'unconfigured') {
    return NextResponse.json({ error: 'cron not configured' }, { status: 503 });
  }
  if (auth === 'unauthorized') {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  try {
    const summary = await runPriceCheck({
      loadRows,
      recordCheck,
      insertNotification,
      loadPushTokens,
      sendEmail: sendPriceDropEmail,
      sendPush: (tokens: readonly string[], message: ExpoPushMessage) => sendExpoPush(tokens, message),
    });
    return NextResponse.json(summary);
  } catch (error) {
    // A per-row failure is handled inside runPriceCheck; reaching here means the
    // batch couldn't start (e.g. the row load failed). Don't echo internals.
    console.error(
      `[era-cron] price-check batch failed: ${error instanceof Error ? error.name : 'unknown'}`,
    );
    return NextResponse.json({ error: 'price_check_failed' }, { status: 500 });
  }
}
