/**
 * DELETE /api/eras/[id]/outfits/[outfitId]
 *
 * Remove an outfit from an era. The era must belong to the caller (404 when
 * absent, 403 when foreign); the delete is scoped to this era/outfit pair, so
 * removing a pair that isn't linked is a no-op 200.
 *
 * Responses:
 *   - 401 { error: 'unauthenticated' }  no session
 *   - 403 { error: 'forbidden' }        caller is not the era owner
 *   - 404 { error: 'not_found' }        no era with that id
 *   - 200 { success: true }             unlinked (or nothing to unlink)
 */
import { and, eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';

import { type AuthContext, AuthzError, ownerOnly, requireUser } from '@era/core';
import { createDbClient, eraOutfits, eras } from '@era/db';

import { auth } from '../../../../../../lib/auth.ts';

const db = createDbClient(process.env.DATABASE_URL!);

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string; outfitId: string }> },
): Promise<NextResponse> {
  const sessionResult = await auth.api.getSession({ headers: request.headers });
  const ctx: AuthContext = { userId: sessionResult?.user.id ?? null };

  try {
    requireUser(ctx);
  } catch (error) {
    if (error instanceof AuthzError) {
      return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
    }
    throw error;
  }

  const { id: eraId, outfitId } = await params;

  const [era] = await db.select({ userId: eras.userId }).from(eras).where(eq(eras.id, eraId)).limit(1);
  if (!era) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }
  try {
    ownerOnly(ctx, era.userId);
  } catch (error) {
    if (error instanceof AuthzError) {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 });
    }
    throw error;
  }

  await db.delete(eraOutfits).where(and(eq(eraOutfits.eraId, eraId), eq(eraOutfits.outfitId, outfitId)));
  return NextResponse.json({ success: true });
}
