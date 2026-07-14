/**
 * Share an outfit or era to the feed, or unshare it.
 *
 *   POST   /api/posts  { outfitId } | { eraId }  →  { post: { id, type, createdAt } }
 *   DELETE /api/posts  { postId }                →  { deleted: true }
 *
 * Sharing is a CONSENT act — the post is the publicity grant for its subject. The
 * caller may only share their OWN outfit/era; a missing OR unowned subject is a
 * flat 404 (no ownership oracle — you can't probe whether an id exists but belongs
 * to someone else). Idempotent: re-sharing a still-shared subject returns the
 * existing post (200), never a duplicate. Unshare is owner-scoped and idempotent
 * (deleting a nonexistent/foreign post still answers `{ deleted: true }`).
 *
 * DORMANT behind `ERA_FEED_ENABLED` (404 while off). POST is rate-limited to
 * `MAX_POSTS_PER_DAY`; DELETE is uncapped.
 *
 * Responses:
 *   - 404 { error: 'not_found' }        feed dormant, OR subject missing/unowned (POST)
 *   - 401 { error: 'unauthenticated' }  no session
 *   - 403 { error: 'forbidden' }        cross-origin request
 *   - 400 { error: 'invalid' }          body isn't exactly one of { outfitId } | { eraId } (POST) / { postId } (DELETE)
 *   - 429 { error: 'daily_limit' }      post cap reached (POST only)
 *   - 200 { post } | { deleted: true }
 */
import { NextResponse } from 'next/server';

import { createDbClient } from '@era/db';

import { auth } from '../../../lib/auth.ts';
import { isFeedEnabledServer } from '../../../lib/feed-server.ts';
import {
  checkPostLimit,
  ownsEra,
  ownsOutfit,
  sharePost,
  toFeedPostLite,
  unsharePost,
  type ShareSubject,
} from '../../../lib/posts-server.ts';
import { isSameOrigin } from '../../../lib/shop-query.ts';

const db = createDbClient(process.env.DATABASE_URL!);

/** A single id is tiny — bound the body defensively. */
const MAX_BODY_BYTES = 4 * 1024;

/** items.id / outfits.id / eras.id / feed_posts.id are all pg uuids. */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_RE.test(value);
}

/** Resolve the caller's id + same-origin, or the matching error response. */
async function authorizeWrite(request: Request): Promise<{ userId: string } | NextResponse> {
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

export async function POST(request: Request): Promise<NextResponse> {
  if (!isFeedEnabledServer()) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }
  const authed = await authorizeWrite(request);
  if (authed instanceof NextResponse) {
    return authed;
  }
  const { userId } = authed;

  const body = await readBody(request);
  if (body === null) {
    return NextResponse.json({ error: 'invalid' }, { status: 400 });
  }

  // Exactly one subject — outfit XOR era (mirrors the DB's num_nonnulls CHECK).
  const hasOutfit = 'outfitId' in body && body.outfitId !== undefined;
  const hasEra = 'eraId' in body && body.eraId !== undefined;
  if (hasOutfit === hasEra) {
    return NextResponse.json({ error: 'invalid' }, { status: 400 });
  }

  let subject: ShareSubject;
  if (hasOutfit) {
    if (!isUuid(body.outfitId)) {
      return NextResponse.json({ error: 'invalid' }, { status: 400 });
    }
    // Missing or not-the-caller's → flat 404 (no ownership oracle).
    if (!(await ownsOutfit(db, userId, body.outfitId))) {
      return NextResponse.json({ error: 'not_found' }, { status: 404 });
    }
    subject = { outfitId: body.outfitId };
  } else {
    if (!isUuid(body.eraId)) {
      return NextResponse.json({ error: 'invalid' }, { status: 400 });
    }
    if (!(await ownsEra(db, userId, body.eraId))) {
      return NextResponse.json({ error: 'not_found' }, { status: 404 });
    }
    subject = { eraId: body.eraId };
  }

  // Per-user daily post cap — reject at/over before the insert (429), same idiom
  // as the follow cap. Idempotent re-shares of an already-live subject still pay
  // the check but write nothing; the cap bounds NET distinct fresh shares.
  const limit = await checkPostLimit(db, userId);
  if (!limit.allowed) {
    return NextResponse.json({ error: 'daily_limit' }, { status: 429 });
  }

  const post = await sharePost(db, userId, subject);
  return NextResponse.json({ post: toFeedPostLite(post) }, { status: 200 });
}

export async function DELETE(request: Request): Promise<NextResponse> {
  if (!isFeedEnabledServer()) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }
  const authed = await authorizeWrite(request);
  if (authed instanceof NextResponse) {
    return authed;
  }
  const { userId } = authed;

  const body = await readBody(request);
  if (body === null || !isUuid(body.postId)) {
    return NextResponse.json({ error: 'invalid' }, { status: 400 });
  }

  // Owner-scoped + idempotent: a foreign/absent id matches zero rows and still
  // answers deleted:true (no oracle on whether the post existed).
  await unsharePost(db, userId, body.postId);
  return NextResponse.json({ deleted: true }, { status: 200 });
}
