/**
 * GET /api/username/check?u=<username>
 *
 * Read-only username availability check for the onboarding username picker.
 * Deliberately UNAUTHENTICATED: it exposes only a boolean and a coarse reason,
 * never any profile data, so it is safe to call before a session exists.
 * (Rate limiting is tracked in the backlog.)
 *
 * Response: `{ available: boolean, reason?: 'invalid' | 'reserved' | 'taken' }`.
 *   - Malformed input            -> { available: false, reason: 'invalid' }
 *   - Reserved (app-route) name  -> { available: false, reason: 'reserved' }
 *   - Well-formed but in use     -> { available: false, reason: 'taken' }
 *   - Well-formed and free       -> { available: true }
 */
import { eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';

import { isReservedUsername } from '@era/core';
import { createDbClient, profiles } from '@era/db';

import { isValidUsername } from '../../../../lib/username.ts';

const db = createDbClient(process.env.DATABASE_URL!);

export async function GET(request: Request): Promise<NextResponse> {
  const candidate = new URL(request.url).searchParams.get('u');

  if (!isValidUsername(candidate)) {
    return NextResponse.json({ available: false, reason: 'invalid' });
  }

  if (isReservedUsername(candidate)) {
    return NextResponse.json({ available: false, reason: 'reserved' });
  }

  const [existing] = await db
    .select({ userId: profiles.userId })
    .from(profiles)
    .where(eq(profiles.username, candidate))
    .limit(1);

  if (existing) {
    return NextResponse.json({ available: false, reason: 'taken' });
  }

  return NextResponse.json({ available: true });
}
