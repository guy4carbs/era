/**
 * Follow / unfollow another Era account.
 *
 *   POST   /api/follows   { username }  → follow    → { following: true,  followerCount }
 *   DELETE /api/follows   { username }  → unfollow  → { following: false, followerCount }
 *
 * The follower is ALWAYS the session user — a caller can only create/remove
 * their own edge (authorized through `@era/core` `canInsertFollow`). The body
 * names the followee by username, which the server resolves to a user id; the
 * client never supplies a follower id.
 *
 * Rules:
 *   - session-gated (401) + same-origin (403), mirroring the other write routes.
 *   - `{ error: 'self' }` (400) — you cannot follow yourself.
 *   - `{ error: 'unknown' }` (400) — no such (or reserved) username to follow.
 *   - Private accounts CAN be followed: there is NO approval flow this phase, and
 *     following a private account does NOT grant access to its content — it only
 *     bumps the follower count. A follow-REQUEST/approval model for private
 *     accounts is a DEFERRED product decision, intentionally out of scope here.
 *   - Idempotent: a repeat follow is a no-op (composite-PK `onConflictDoNothing`);
 *     an unfollow with no edge matches zero rows. Either way the response carries
 *     the current, freshly counted `followerCount`.
 *   - Rate-limited: at most `MAX_FOLLOWS_PER_DAY` follows per caller in a rolling
 *     24h window (a mass-follow-spam brake); at/over the cap POST returns 429
 *     `daily_limit`. Unfollow is uncapped. The bound is approximate — see the
 *     note at the limit check in POST.
 *
 * `followerCount` is computed live with COUNT over the indexed `follows` columns
 * (no denormalized counter this phase — see follows-server.ts).
 *
 * Responses:
 *   - 401 { error: 'unauthenticated' }  no session
 *   - 403 { error: 'forbidden' }        cross-origin request
 *   - 400 { error: 'invalid' }          body isn't { username: string }
 *   - 400 { error: 'self' }             username resolves to the caller
 *   - 400 { error: 'unknown' }          username resolves to no account
 *   - 429 { error: 'daily_limit' }      follow cap reached (POST only)
 *   - 200 { following: boolean, followerCount: number }
 */
import { NextResponse } from 'next/server';

import { type AuthContext, AuthzError, canInsertFollow, requireUser } from '@era/core';
import { createDbClient } from '@era/db';

import { auth } from '../../../lib/auth.ts';
import { isBlockedEitherWay } from '../../../lib/blocks-server.ts';
import {
  checkFollowLimit,
  countFollowers,
  followUser,
  resolveUserIdByUsername,
  unfollowUser,
} from '../../../lib/follows-server.ts';
import { isSameOrigin } from '../../../lib/shop-query.ts';
import { isValidUsername } from '../../../lib/username.ts';

const db = createDbClient(process.env.DATABASE_URL!);

/** A single `{ username }` is tiny — bound the body defensively. */
const MAX_BODY_BYTES = 4 * 1024;

/** Resolve the caller's id, or an error response. Shared by POST and DELETE. */
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
 * Validate the body and resolve `{ username }` to the followee's user id,
 * enforcing the self/unknown rules. Returns either the target id or the error
 * response to send. `callerId` is the session user (the prospective follower).
 */
async function resolveTarget(request: Request, callerId: string): Promise<string | NextResponse> {
  const body = await readBody(request);
  const username = body?.username;
  if (typeof username !== 'string' || !isValidUsername(username)) {
    // A malformed body is `invalid`; a well-formed name that owns no account is
    // `unknown` (handled below). Reserved names never own an account either.
    return NextResponse.json({ error: 'invalid' }, { status: 400 });
  }

  const targetId = await resolveUserIdByUsername(db, username);
  if (targetId === null) {
    return NextResponse.json({ error: 'unknown' }, { status: 400 });
  }
  if (targetId === callerId) {
    return NextResponse.json({ error: 'self' }, { status: 400 });
  }
  // Bidirectional invisibility: a caller and target who block each other in either
  // direction are mutually non-existent, so a follow/unfollow against a blocked
  // account is `unknown` — the SAME response as a username that owns no account.
  // No oracle: you can't tell "blocked me" apart from "doesn't exist".
  if (await isBlockedEitherWay(db, callerId, targetId)) {
    return NextResponse.json({ error: 'unknown' }, { status: 400 });
  }
  return targetId;
}

export async function POST(request: Request): Promise<NextResponse> {
  const authed = await authorize(request);
  if (authed instanceof NextResponse) {
    return authed;
  }
  const { userId, ctx } = authed;

  const target = await resolveTarget(request, userId);
  if (target instanceof NextResponse) {
    return target;
  }

  try {
    canInsertFollow(ctx, { followerId: userId });
  } catch (error) {
    if (error instanceof AuthzError) {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 });
    }
    throw error;
  }

  // Per-user follow rate limit: the caller may create at most a fixed number of
  // edges in a rolling 24h window (mass-follow-spam brake). At/over the cap we
  // reject BEFORE the insert with the same 429 `daily_limit` idiom the metered AI
  // routes use. Unfollow (DELETE) is deliberately uncapped.
  //
  // APPROXIMATE BOUND (documented, accepted): an unfollow deletes the row it
  // counted, so follow⇄unfollow churn on one target keeps this count low while
  // still issuing many writes. The cap thus bounds NET distinct follows per day —
  // the spam vector — not raw write volume. Making it churn-proof would need a
  // schema change (a durable counter or an event kind); the write-amplification
  // residue is a generic edge concern better answered at the WAF/edge (Bastion)
  // than by per-instance in-memory state that a restart or second replica voids.
  const followLimit = await checkFollowLimit(db, userId);
  if (!followLimit.allowed) {
    return NextResponse.json({ error: 'daily_limit' }, { status: 429 });
  }

  await followUser(db, userId, target);
  const followerCount = await countFollowers(db, target);
  return NextResponse.json({ following: true, followerCount }, { status: 200 });
}

export async function DELETE(request: Request): Promise<NextResponse> {
  const authed = await authorize(request);
  if (authed instanceof NextResponse) {
    return authed;
  }
  const { userId, ctx } = authed;

  const target = await resolveTarget(request, userId);
  if (target instanceof NextResponse) {
    return target;
  }

  // Same authorization as follow: the caller may only touch their own edge.
  try {
    canInsertFollow(ctx, { followerId: userId });
  } catch (error) {
    if (error instanceof AuthzError) {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 });
    }
    throw error;
  }

  await unfollowUser(db, userId, target);
  const followerCount = await countFollowers(db, target);
  return NextResponse.json({ following: false, followerCount }, { status: 200 });
}
