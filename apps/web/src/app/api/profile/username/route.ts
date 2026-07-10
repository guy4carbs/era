/**
 * POST /api/profile/username  { username: string }
 *
 * Set the authenticated user's username. This is a WRITE, so it goes through
 * the @era/core authz guard: we resolve the caller into an AuthContext and call
 * `requireUser` before touching data. There is no owner-id to compare — the row
 * is keyed by the session's own user id, so an authenticated caller can only
 * ever write their own profile.
 *
 * Responses:
 *   - 401 { error: 'unauthenticated' }  no session
 *   - 400 { error: 'invalid' }          malformed username
 *   - 409 { error: 'reserved' }         username collides with an app route
 *   - 409 { error: 'taken' }            username already in use
 *   - 200 { username }                  updated
 */
import { eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';

import { type AuthContext, AuthzError, isReservedUsername, requireUser } from '@era/core';
import { createDbClient, profiles } from '@era/db';

import { auth } from '../../../../lib/auth.ts';
import { isValidUsername } from '../../../../lib/username.ts';

const db = createDbClient(process.env.DATABASE_URL!);

/** Postgres unique-violation SQLSTATE. */
const PG_UNIQUE_VIOLATION = '23505';

function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && (error as { code: unknown }).code === PG_UNIQUE_VIOLATION;
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

  const body: unknown = await request.json().catch(() => null);
  const username = (body as { username?: unknown } | null)?.username;

  if (!isValidUsername(username)) {
    return NextResponse.json({ error: 'invalid' }, { status: 400 });
  }

  // A reserved name would shadow an app route — refuse it before the write. The
  // profile loader treats the same names as not-found, so the two paths agree.
  if (isReservedUsername(username)) {
    return NextResponse.json({ error: 'reserved' }, { status: 409 });
  }

  try {
    await db.update(profiles).set({ username }).where(eq(profiles.userId, userId));
  } catch (error) {
    if (isUniqueViolation(error)) {
      return NextResponse.json({ error: 'taken' }, { status: 409 });
    }
    throw error;
  }

  return NextResponse.json({ username });
}
