/**
 * Block / unblock an account, and list who you've blocked.
 *
 *   POST   /api/blocks  { username }  →  { blocked: true }
 *   DELETE /api/blocks  { username }  →  { blocked: false }
 *   GET    /api/blocks                →  { blocked: [{ username, displayName, avatarUrl }] }
 *
 * A block is BIDIRECTIONAL invisibility (feed, profiles, and a future search) and
 * severs any existing follow edge in both directions (see blocks-server.ts). It is
 * idempotent: re-blocking is a no-op, unblocking an absent edge still answers
 * `{ blocked: false }`. The GET list is the accounts YOU blocked (so you can
 * unblock them) — Settings surfaces it and Apple reviewers look for the unblock
 * path.
 *
 * DORMANT behind `ERA_FEED_ENABLED` (404 while off). POST is rate-limited to
 * `MAX_BLOCKS_PER_DAY`; DELETE and GET are uncapped.
 *
 * Responses:
 *   - 404 { error: 'not_found' }        feed dormant
 *   - 401 { error: 'unauthenticated' }  no session
 *   - 403 { error: 'forbidden' }        cross-origin request (POST/DELETE)
 *   - 400 { error: 'invalid' }          body isn't { username: string }
 *   - 400 { error: 'unknown' }          username resolves to no account
 *   - 400 { error: 'self' }             you cannot block yourself (POST)
 *   - 429 { error: 'daily_limit' }      block cap reached (POST only)
 *   - 200 { blocked: boolean } | { blocked: [...] }
 */
import { NextResponse } from 'next/server';

import { createDbClient } from '@era/db';

import { auth } from '../../../lib/auth.ts';
import { blockUser, checkBlockLimit, listBlocked, unblockUser } from '../../../lib/blocks-server.ts';
import { isFeedEnabledServer } from '../../../lib/feed-server.ts';
import { resolveUserIdByUsername } from '../../../lib/follows-server.ts';
import { isSameOrigin } from '../../../lib/shop-query.ts';
import { isValidUsername } from '../../../lib/username.ts';

const db = createDbClient(process.env.DATABASE_URL!);

/** A single `{ username }` is tiny — bound the body defensively. */
const MAX_BODY_BYTES = 4 * 1024;

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

/** flag → session → same-origin, or the matching error response. Shared by POST/DELETE. */
async function authorizeWrite(request: Request): Promise<{ userId: string } | NextResponse> {
  if (!isFeedEnabledServer()) {
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
  return { userId };
}

/** Read + validate + resolve the `{ username }` target, or the error response. */
async function resolveTarget(request: Request): Promise<string | NextResponse> {
  const body = await readBody(request);
  if (body === null || !isValidUsername(body.username)) {
    return NextResponse.json({ error: 'invalid' }, { status: 400 });
  }
  const targetId = await resolveUserIdByUsername(db, body.username);
  if (targetId === null) {
    return NextResponse.json({ error: 'unknown' }, { status: 400 });
  }
  return targetId;
}

export async function POST(request: Request): Promise<NextResponse> {
  const authed = await authorizeWrite(request);
  if (authed instanceof NextResponse) {
    return authed;
  }
  const { userId } = authed;

  const target = await resolveTarget(request);
  if (target instanceof NextResponse) {
    return target;
  }
  if (target === userId) {
    return NextResponse.json({ error: 'self' }, { status: 400 });
  }

  const limit = await checkBlockLimit(db, userId);
  if (!limit.allowed) {
    return NextResponse.json({ error: 'daily_limit' }, { status: 429 });
  }

  await blockUser(db, userId, target);
  return NextResponse.json({ blocked: true }, { status: 200 });
}

export async function DELETE(request: Request): Promise<NextResponse> {
  const authed = await authorizeWrite(request);
  if (authed instanceof NextResponse) {
    return authed;
  }
  const { userId } = authed;

  const target = await resolveTarget(request);
  if (target instanceof NextResponse) {
    return target;
  }

  // Uncapped + idempotent: unblocking an absent edge still answers blocked:false.
  await unblockUser(db, userId, target);
  return NextResponse.json({ blocked: false }, { status: 200 });
}

export async function GET(request: Request): Promise<NextResponse> {
  if (!isFeedEnabledServer()) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }
  const session = await auth.api.getSession({ headers: request.headers });
  const userId = session?.user.id;
  if (!userId) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  }

  const blocked = await listBlocked(db, userId);
  return NextResponse.json({ blocked }, { status: 200 });
}
