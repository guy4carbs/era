/**
 * Read / update the caller's price-alert preferences (opt-in channels).
 *
 *   GET /api/notifications/preferences
 *     → { priceAlertsEnabled, emailAlerts, pushAlerts }   (all false if no row)
 *   PUT /api/notifications/preferences
 *     { priceAlertsEnabled?, emailAlerts?, pushAlerts? }   (optional booleans)
 *     → the full updated preferences
 *
 * Owner-scoped end to end: the `userId` is ALWAYS derived from the session, never
 * the body, and the write is authorized through `@era/core`'s
 * `canReadNotificationPreferences` / `canUpsertNotificationPreferences` guards, so
 * a user can never read or flip another user's alert flags. Mirrors api/shop/save:
 * session-gated (401), same-origin on the mutating verb (403), body-capped (400).
 * Server-only; no secrets logged.
 *
 * Responses:
 *   - 401 { error: 'unauthenticated' }  no session
 *   - 403 { error: 'forbidden' }        cross-origin (PUT) / non-owner
 *   - 400 { error: 'invalid' }          body failed validation
 *   - 200 preferences
 */
import { NextResponse } from 'next/server';

import {
  type AuthContext,
  AuthzError,
  canReadNotificationPreferences,
  canUpsertNotificationPreferences,
  requireUser,
} from '@era/core';
import { createDbClient } from '@era/db';

import { auth } from '../../../../lib/auth.ts';
import {
  type NotificationPreferencesPatch,
  getNotificationPreferences,
  upsertNotificationPreferences,
} from '../../../../lib/notifications-server.ts';
import { isSameOrigin } from '../../../../lib/shop-query.ts';

const db = createDbClient(process.env.DATABASE_URL!);

/** A handful of boolean flags — tiny either way. */
const MAX_BODY_BYTES = 8 * 1024;

/** Resolve the caller's id, or a 401. Shared by GET and PUT. */
async function authenticate(request: Request): Promise<{ userId: string; ctx: AuthContext } | NextResponse> {
  const sessionResult = await auth.api.getSession({ headers: request.headers });
  const ctx: AuthContext = { userId: sessionResult?.user.id ?? null };
  try {
    return { userId: requireUser(ctx), ctx };
  } catch (error) {
    if (error instanceof AuthzError) {
      return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
    }
    throw error;
  }
}

/** Read the capped JSON object body, or null (→ 400) on any failure. */
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

/**
 * Parse the optional-booleans patch, or null (→ 400) if any present field is not
 * a boolean. An absent field is left untouched by the upsert.
 */
function parsePatch(body: Record<string, unknown>): NotificationPreferencesPatch | null {
  const patch: NotificationPreferencesPatch = {};
  for (const key of ['priceAlertsEnabled', 'emailAlerts', 'pushAlerts'] as const) {
    const value = body[key];
    if (value === undefined) continue;
    if (typeof value !== 'boolean') return null;
    patch[key] = value;
  }
  return patch;
}

export async function GET(request: Request): Promise<NextResponse> {
  const authed = await authenticate(request);
  if (authed instanceof NextResponse) {
    return authed;
  }
  const { userId, ctx } = authed;

  try {
    canReadNotificationPreferences(ctx, { userId });
  } catch (error) {
    if (error instanceof AuthzError) {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 });
    }
    throw error;
  }

  const preferences = await getNotificationPreferences(db, userId);
  return NextResponse.json(preferences, { status: 200 });
}

export async function PUT(request: Request): Promise<NextResponse> {
  const authed = await authenticate(request);
  if (authed instanceof NextResponse) {
    return authed;
  }
  const { userId, ctx } = authed;

  if (!isSameOrigin(request)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const body = await readBody(request);
  if (!body) {
    return NextResponse.json({ error: 'invalid' }, { status: 400 });
  }
  const patch = parsePatch(body);
  if (!patch) {
    return NextResponse.json({ error: 'invalid' }, { status: 400 });
  }

  try {
    canUpsertNotificationPreferences(ctx, { userId });
  } catch (error) {
    if (error instanceof AuthzError) {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 });
    }
    throw error;
  }

  const preferences = await upsertNotificationPreferences(db, userId, patch);
  return NextResponse.json(preferences, { status: 200 });
}
