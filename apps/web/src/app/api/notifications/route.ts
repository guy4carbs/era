/**
 * List the caller's in-app "price dropped" notification cards.
 *
 *   GET /api/notifications
 *     → { notifications: NotificationView[] }   newest-first, capped ~50
 *
 * Owner-scoped: `userId` is derived from the session and the query filters by it,
 * authorized through `@era/core`'s `canReadInAppNotification` — a user only ever
 * sees their own cards. Cards themselves are written by the server-side
 * price-check job, not this route. Session-gated (401); no body. Server-only.
 *
 * Responses:
 *   - 401 { error: 'unauthenticated' }  no session
 *   - 403 { error: 'forbidden' }        non-owner
 *   - 200 { notifications: NotificationView[] }
 */
import { NextResponse } from 'next/server';

import { type AuthContext, AuthzError, canReadInAppNotification, requireUser } from '@era/core';
import { createDbClient } from '@era/db';

import { auth } from '../../../lib/auth.ts';
import { listInAppNotifications } from '../../../lib/notifications-server.ts';

const db = createDbClient(process.env.DATABASE_URL!);

export async function GET(request: Request): Promise<NextResponse> {
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

  try {
    canReadInAppNotification(ctx, { userId });
  } catch (error) {
    if (error instanceof AuthzError) {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 });
    }
    throw error;
  }

  const notifications = await listInAppNotifications(db, userId);
  return NextResponse.json({ notifications }, { status: 200 });
}
