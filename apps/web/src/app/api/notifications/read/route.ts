/**
 * Mark one of the caller's in-app notifications read.
 *
 *   POST /api/notifications/read   { id }   → { ok: true }
 *
 * Owner-scoped with no IDOR: the row is fetched by id, then
 * `canUpdateInAppNotification` verifies the row's `userId` equals the session
 * before the write — a cross-user id yields 403, never a silent mark-read. The
 * update itself is also `WHERE user_id = session` scoped as defence in depth.
 * Session-gated (401), same-origin (403), body-capped (400). Server-only.
 *
 * Responses:
 *   - 401 { error: 'unauthenticated' }  no session
 *   - 403 { error: 'forbidden' }        cross-origin / not the owner
 *   - 400 { error: 'invalid' }          missing / malformed id
 *   - 404 { error: 'not_found' }        no such notification
 *   - 200 { ok: true }
 */
import { NextResponse } from 'next/server';

import { type AuthContext, AuthzError, canUpdateInAppNotification, requireUser } from '@era/core';
import { createDbClient } from '@era/db';

import { auth } from '../../../../lib/auth.ts';
import { findInAppNotification, markInAppNotificationRead } from '../../../../lib/notifications-server.ts';
import { isSameOrigin } from '../../../../lib/shop-query.ts';

const db = createDbClient(process.env.DATABASE_URL!);

/** One id — tiny. */
const MAX_BODY_BYTES = 8 * 1024;
// in_app_notifications.id is a pg `uuid`: a non-UUID id would reach `eq(...)` and
// surface as a Postgres syntax error (500) instead of a clean 400. Reject early.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function readBody(request: Request): Promise<Record<string, unknown> | null> {
  const declaredLength = Number(request.headers.get('content-length'));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) {
    return null;
  }
  const rawBody = await request.text().catch(() => '');
  if (rawBody.length > MAX_BODY_BYTES) {
    return null;
  }
  let body: unknown;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return null;
  }
  if (typeof body !== 'object' || body === null) {
    return null;
  }
  return body as Record<string, unknown>;
}

export async function POST(request: Request): Promise<NextResponse> {
  const sessionResult = await auth.api.getSession({ headers: request.headers });
  const ctx: AuthContext = { userId: sessionResult?.user.id ?? null };

  let userId: string;
  try {
    userId = requireUser(ctx);
  } catch (error) {
    if (error instanceof AuthzError) {
      return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
    }
    throw error;
  }

  if (!isSameOrigin(request)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const body = await readBody(request);
  if (!body || typeof body.id !== 'string' || !UUID_RE.test(body.id)) {
    return NextResponse.json({ error: 'invalid' }, { status: 400 });
  }
  const id = body.id;

  const notification = await findInAppNotification(db, id);
  if (!notification) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }

  // Owner check on the actual row — a cross-user id is a 403, not a mark-read.
  try {
    canUpdateInAppNotification(ctx, { userId: notification.userId });
  } catch (error) {
    if (error instanceof AuthzError) {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 });
    }
    throw error;
  }

  await markInAppNotificationRead(db, userId, id);
  return NextResponse.json({ ok: true }, { status: 200 });
}
