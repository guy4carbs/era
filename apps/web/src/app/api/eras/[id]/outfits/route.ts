/**
 * POST /api/eras/[id]/outfits  { outfitId }
 *
 * Add an outfit to an era. Both the era and the outfit must belong to the
 * caller — either being absent or foreign is a 404/403 — so an era can only
 * ever reference the caller's own outfits. The join is idempotent
 * (onConflictDoNothing), so re-adding an outfit is a no-op 200.
 *
 * Responses:
 *   - 401 { error: 'unauthenticated' }  no session
 *   - 400 { error: 'invalid' }          missing/blank outfitId
 *   - 403 { error: 'forbidden' }        caller owns neither the era nor the outfit
 *   - 404 { error: 'not_found' }        no era, or no outfit, with that id
 *   - 200 { success: true }             linked (or already linked)
 */
import { eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';

import { type AuthContext, AuthzError, ownerOnly, requireUser } from '@era/core';
import { createDbClient, eraOutfits, eras, outfits } from '@era/db';

import { auth } from '../../../../../lib/auth.ts';

const db = createDbClient(process.env.DATABASE_URL!);

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
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

  const { id: eraId } = await params;

  const body: unknown = await request.json().catch(() => null);
  const outfitId = (body as { outfitId?: unknown } | null)?.outfitId;
  if (typeof outfitId !== 'string' || outfitId.length === 0) {
    return NextResponse.json({ error: 'invalid' }, { status: 400 });
  }

  const [era] = await db.select({ userId: eras.userId }).from(eras).where(eq(eras.id, eraId)).limit(1);
  if (!era) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }
  const [outfit] = await db.select({ userId: outfits.userId }).from(outfits).where(eq(outfits.id, outfitId)).limit(1);
  if (!outfit) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }
  try {
    ownerOnly(ctx, era.userId);
    ownerOnly(ctx, outfit.userId);
  } catch (error) {
    if (error instanceof AuthzError) {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 });
    }
    throw error;
  }

  await db.insert(eraOutfits).values({ eraId, outfitId }).onConflictDoNothing();
  return NextResponse.json({ success: true });
}
