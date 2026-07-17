/**
 * The consented avatar resource.
 *
 *   POST   /api/avatar  { photoKeys: string[] }  →  AvatarState  (claim + build)
 *   GET    /api/avatar                            →  AvatarState  (read own state)
 *   DELETE /api/avatar                            →  { deleted, storageObjectsDeleted, remaining }
 *
 * POST claims the avatar row (consent stamped server-side) and builds the likeness
 * from 1–3 source photos the client already uploaded via /api/avatar/upload-url,
 * then deletes those source objects. It is Era+-gated (building an avatar is a paid
 * feature). GET reads your OWN state and is intentionally NOT plus-gated — a lapsed
 * subscriber can still see and delete what they made. DELETE is the erasure path:
 * it sweeps the avatars bucket and verifies zero objects remain.
 *
 * DORMANT behind `ERA_TRYON_ENABLED` (every verb 404s while off).
 *
 * Gate order — POST: flag → session → origin → Era+ → validate keys → FASHN
 * configured → monthly cap → claim/build. GET: flag → session. DELETE: flag →
 * session → origin.
 *
 * Responses:
 *   - 404 { error: 'not_found' }         feature dormant
 *   - 401 { error: 'unauthenticated' }   no session
 *   - 403 { error: 'forbidden' }         cross-origin mutating request
 *   - 403 { error: 'plus_required' }     POST: not an Era+ subscriber
 *   - 400 { error: 'invalid_keys' }      POST: photoKeys missing/malformed/foreign
 *   - 503 { error: 'unavailable' }       POST: FASHN not configured
 *   - 429 { error: 'monthly_limit', used, limit }  POST: monthly creation cap reached
 *   - 409 { error: 'already_exists' | 'creating' }  POST: avatar already present / in flight
 *   - 502 { error: 'creation_failed' }   POST: the build pipeline failed (retryable)
 *   - 200 AvatarState                    POST (built), GET
 *   - 200 { deleted: true, storageObjectsDeleted, remaining }  DELETE
 *   - 500 { error: 'deletion_failed' }   DELETE: storage/DB error (DB untouched, retryable)
 */
import { NextResponse } from 'next/server';

import { type AuthContext } from '@era/core';
import { createDbClient } from '@era/db';

import { auth } from '../../../lib/auth.ts';
import {
  areValidAvatarSourceKeys,
  checkAvatarMonthlyLimit,
  createAvatar,
  deleteAvatar,
  getAvatarState,
} from '../../../lib/avatar-server.ts';
import { isFashnConfigured } from '../../../lib/fashn.ts';
import { getUserPlusState } from '../../../lib/plus-server.ts';
import { isSameOrigin } from '../../../lib/shop-query.ts';
import { isTryonEnabledServer } from '../../../lib/tryon-server.ts';

const db = createDbClient(process.env.DATABASE_URL!);

export async function POST(request: Request): Promise<NextResponse> {
  if (!isTryonEnabledServer()) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }
  const session = await auth.api.getSession({ headers: request.headers });
  const userId = session?.user.id;
  if (!userId) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  }
  if (!isSameOrigin(request)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  const plus = await getUserPlusState(db, userId);
  if (!plus.isPlus) {
    return NextResponse.json({ error: 'plus_required' }, { status: 403 });
  }

  const body: unknown = await request.json().catch(() => null);
  const photoKeys = (body as { photoKeys?: unknown } | null)?.photoKeys;
  if (!areValidAvatarSourceKeys(userId, photoKeys)) {
    return NextResponse.json({ error: 'invalid_keys' }, { status: 400 });
  }

  if (!isFashnConfigured()) {
    return NextResponse.json({ error: 'unavailable' }, { status: 503 });
  }
  const cap = await checkAvatarMonthlyLimit(db, userId);
  if (!cap.allowed) {
    return NextResponse.json({ error: 'monthly_limit', used: cap.used, limit: cap.limit }, { status: 429 });
  }

  const ctx: AuthContext = { userId };
  const result = await createAvatar(ctx, userId, photoKeys, db);
  if (!result.ok) {
    if (result.code === 'already_exists' || result.code === 'creating') {
      return NextResponse.json({ error: result.code }, { status: 409 });
    }
    return NextResponse.json({ error: 'creation_failed' }, { status: 502 });
  }
  return NextResponse.json(result.state);
}

export async function GET(request: Request): Promise<NextResponse> {
  if (!isTryonEnabledServer()) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }
  const session = await auth.api.getSession({ headers: request.headers });
  const userId = session?.user.id;
  if (!userId) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  }

  const ctx: AuthContext = { userId };
  const state = await getAvatarState(db, ctx, userId);
  return NextResponse.json(state);
}

export async function DELETE(request: Request): Promise<NextResponse> {
  if (!isTryonEnabledServer()) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }
  const session = await auth.api.getSession({ headers: request.headers });
  const userId = session?.user.id;
  if (!userId) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  }
  if (!isSameOrigin(request)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  try {
    const { storageObjectsDeleted, remaining } = await deleteAvatar(userId, db);
    return NextResponse.json({ deleted: true, storageObjectsDeleted, remaining });
  } catch (error) {
    // Storage is swept BEFORE any DB write, so a failure here leaves the account
    // intact and the delete is safely retryable.
    console.error(`[era-tryon] avatar deletion failed for user ${userId}:`, error);
    return NextResponse.json({ error: 'deletion_failed' }, { status: 500 });
  }
}
