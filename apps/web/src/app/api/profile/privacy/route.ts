/**
 * GET  /api/profile/privacy   -> { isPrivate: boolean }
 * PATCH /api/profile/privacy  { isPrivate: boolean } -> { isPrivate }
 *
 * Read/update the authenticated user's closet privacy toggle. is_private is a
 * real visibility control, not cosmetic: it governs whether the user's cutouts
 * and outfit covers resolve to public URLs or to short-lived presigned GETs
 * (see getAssetUrl). There is no owner-id to compare — the row is keyed by the
 * session's own user id (auto-created at signup, so it always exists), so an
 * authenticated caller can only ever read/write their own profile. Not a
 * tag_correction — no ai_events.
 *
 * Responses:
 *   - 401 { error: 'unauthenticated' }  no session
 *   - 400 { error: 'invalid' }          PATCH body isn't { isPrivate: boolean }
 *   - 200 { isPrivate }                 current (GET) or updated (PATCH) value
 */
import { eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';

import { type AuthContext, AuthzError, requireUser } from '@era/core';
import { createDbClient, profiles } from '@era/db';

import { auth } from '../../../../lib/auth.ts';

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

  const [profile] = await db.select({ isPrivate: profiles.isPrivate }).from(profiles).where(eq(profiles.userId, userId)).limit(1);
  // The row always exists (auto-created at signup); default to private if not.
  return NextResponse.json({ isPrivate: profile?.isPrivate ?? true });
}

export async function PATCH(request: Request): Promise<NextResponse> {
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

  const body: unknown = await request.json().catch(() => null);
  const isPrivate = (body as { isPrivate?: unknown } | null)?.isPrivate;

  if (typeof isPrivate !== 'boolean') {
    return NextResponse.json({ error: 'invalid' }, { status: 400 });
  }

  await db.update(profiles).set({ isPrivate }).where(eq(profiles.userId, userId));

  return NextResponse.json({ isPrivate });
}
