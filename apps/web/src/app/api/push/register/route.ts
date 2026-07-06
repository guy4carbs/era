/**
 * Register / unregister a device push token for the caller (push alerts).
 *
 *   POST   /api/push/register   { token, platform: 'ios'|'android' }  → { ok: true }
 *   DELETE /api/push/register   { token }                             → { ok: true }
 *
 * Owner-scoped: the `userId` is ALWAYS the session's, never the body, and the
 * writes go through `@era/core`'s `canInsertPushToken` / `canDeletePushToken`, so
 * a user can only register or drop their own device tokens. Register is
 * idempotent — a re-POST of the same `(userId, token)` is dropped by the unique
 * constraint. Session-gated (401), same-origin (403), body-capped (400).
 * Server-only.
 *
 * Responses:
 *   - 401 { error: 'unauthenticated' }  no session
 *   - 403 { error: 'forbidden' }        cross-origin / non-owner
 *   - 400 { error: 'invalid' }          bad token / platform
 *   - 200 { ok: true }
 */
import { NextResponse } from 'next/server';

import {
  type AuthContext,
  AuthzError,
  canDeletePushToken,
  canInsertPushToken,
  requireUser,
} from '@era/core';
import { createDbClient } from '@era/db';

import { auth } from '../../../../lib/auth.ts';
import { registerPushToken, unregisterPushToken } from '../../../../lib/notifications-server.ts';
import { isSameOrigin } from '../../../../lib/shop-query.ts';

const db = createDbClient(process.env.DATABASE_URL!);

/** One token (+ platform) — small. */
const MAX_BODY_BYTES = 8 * 1024;
/** Bound the stored token (push tokens are well under this). */
const TOKEN_MAX = 512;
const PLATFORMS = ['ios', 'android'] as const;
type Platform = (typeof PLATFORMS)[number];

/** Resolve the caller's id + same-origin, or an error response. */
async function authorize(request: Request): Promise<{ userId: string; ctx: AuthContext } | NextResponse> {
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
  return { userId, ctx };
}

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

/** A non-empty, bounded token string, or null. */
function parseToken(value: unknown): string | null {
  if (typeof value !== 'string' || value.length === 0 || value.length > TOKEN_MAX) {
    return null;
  }
  return value;
}

function isPlatform(value: unknown): value is Platform {
  return typeof value === 'string' && (PLATFORMS as readonly string[]).includes(value);
}

export async function POST(request: Request): Promise<NextResponse> {
  const authed = await authorize(request);
  if (authed instanceof NextResponse) {
    return authed;
  }
  const { userId, ctx } = authed;

  const body = await readBody(request);
  if (!body) {
    return NextResponse.json({ error: 'invalid' }, { status: 400 });
  }
  const token = parseToken(body.token);
  if (!token || !isPlatform(body.platform)) {
    return NextResponse.json({ error: 'invalid' }, { status: 400 });
  }

  try {
    canInsertPushToken(ctx, { userId });
  } catch (error) {
    if (error instanceof AuthzError) {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 });
    }
    throw error;
  }

  await registerPushToken(db, userId, token, body.platform);
  return NextResponse.json({ ok: true }, { status: 200 });
}

export async function DELETE(request: Request): Promise<NextResponse> {
  const authed = await authorize(request);
  if (authed instanceof NextResponse) {
    return authed;
  }
  const { userId, ctx } = authed;

  const body = await readBody(request);
  if (!body) {
    return NextResponse.json({ error: 'invalid' }, { status: 400 });
  }
  const token = parseToken(body.token);
  if (!token) {
    return NextResponse.json({ error: 'invalid' }, { status: 400 });
  }

  try {
    canDeletePushToken(ctx, { userId });
  } catch (error) {
    if (error instanceof AuthzError) {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 });
    }
    throw error;
  }

  await unregisterPushToken(db, userId, token);
  return NextResponse.json({ ok: true }, { status: 200 });
}
