/**
 * GET    /api/outfits/[id]
 * PATCH  /api/outfits/[id]  { name?, occasion?, coverImagePath?, items? }
 * DELETE /api/outfits/[id]
 *
 * GET returns the full "reopen" payload the canvas restores from: the outfit
 * row, its coverUrl, its ordered members joined to their items (each with a
 * resolved displayUrl), and `sharedPostId` — the caller's live feed post for this
 * outfit (or null) so the canvas can hydrate its share-to-feed toggle.
 *
 * PATCH updates scalar fields and, when `items` is provided, REPLACES the
 * outfit's entire outfit_items set (validated for ownership + counts exactly as
 * POST). A supplied coverImagePath must sit under the caller's `{userId}/`
 * prefix. Returns the same full shape as GET.
 *
 * DELETE removes the outfit; the cascade drops its outfit_items and era_outfits.
 *
 * All three load the outfit (404 when absent) then ownerOnly (403 when the
 * caller is not the owner) before doing anything.
 *
 * Responses:
 *   - 401 { error: 'unauthenticated' }  no session
 *   - 400 { error: 'invalid' }          body/items failed validation
 *   - 400 { error: 'unknown_items' }    an itemId is missing or not the caller's
 *   - 403 { error: 'forbidden' }        not the owner, or cover not under prefix
 *   - 404 { error: 'not_found' }        no outfit with that id
 *   - 200 { outfit }                    full shape (GET, PATCH)
 *   - 200 { success: true }             DELETE
 */
import { eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';

import { type AuthContext, AuthzError, deleteObjectsUnderPrefix, ownerOnly, requireUser } from '@era/core';
import { createDbClient, outfitTryons, outfits, profiles } from '@era/db';

import { auth } from '../../../../lib/auth.ts';
import {
  COVER_KEY_MAX,
  OUTFIT_NAME_MAX,
  OUTFIT_OCCASION_MAX,
  allItemsOwnedBy,
  isOwnedCoverKey,
  optionalText,
  parseOutfitItems,
  replaceOutfitItems,
  shapeOutfitDetail,
} from '../../../../lib/outfit-server.ts';
import { livePostIdsByOutfit } from '../../../../lib/posts-server.ts';
import { serverStorageClient } from '../../../../lib/storage-server.ts';

const db = createDbClient(process.env.DATABASE_URL!);

/** Session → caller id, or a 401 response. Returns a discriminated result. */
async function authenticate(request: Request): Promise<{ userId: string; ctx: AuthContext } | NextResponse> {
  const sessionResult = await auth.api.getSession({ headers: request.headers });
  const ctx: AuthContext = { userId: sessionResult?.user.id ?? null };
  try {
    return { userId: requireUser(ctx), ctx };
  } catch (error) {
    if (error instanceof AuthzError) {
      return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
    }
    throw error;
  }
}

/** Load the outfit and enforce ownership, or return the matching error response. */
async function loadOwnedOutfit(id: string, ctx: AuthContext): Promise<typeof outfits.$inferSelect | NextResponse> {
  const [outfit] = await db.select().from(outfits).where(eq(outfits.id, id)).limit(1);
  if (!outfit) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }
  try {
    ownerOnly(ctx, outfit.userId);
  } catch (error) {
    if (error instanceof AuthzError) {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 });
    }
    throw error;
  }
  return outfit;
}

async function ownerFor(userId: string): Promise<{ userId: string; isPrivate: boolean }> {
  const [profile] = await db.select({ isPrivate: profiles.isPrivate }).from(profiles).where(eq(profiles.userId, userId)).limit(1);
  return { userId, isPrivate: profile?.isPrivate ?? true };
}

/**
 * The caller's live feed post id for this outfit, or null when it isn't shared —
 * so the reopen payload hydrates the canvas's share toggle without a re-share.
 */
async function sharedPostIdFor(outfitId: string): Promise<string | null> {
  return (await livePostIdsByOutfit(db, [outfitId])).get(outfitId) ?? null;
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const authed = await authenticate(request);
  if (authed instanceof NextResponse) {
    return authed;
  }
  const { id } = await params;
  const outfit = await loadOwnedOutfit(id, authed.ctx);
  if (outfit instanceof NextResponse) {
    return outfit;
  }

  const owner = await ownerFor(authed.userId);
  const shaped = await shapeOutfitDetail(db, serverStorageClient(), authed.ctx, outfit, owner);
  return NextResponse.json({ outfit: { ...shaped, sharedPostId: await sharedPostIdFor(id) } });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const authed = await authenticate(request);
  if (authed instanceof NextResponse) {
    return authed;
  }
  const { id } = await params;
  const existing = await loadOwnedOutfit(id, authed.ctx);
  if (existing instanceof NextResponse) {
    return existing;
  }

  const body: unknown = await request.json().catch(() => null);
  if (typeof body !== 'object' || body === null) {
    return NextResponse.json({ error: 'invalid' }, { status: 400 });
  }
  const root = body as Record<string, unknown>;

  const name = optionalText(root, 'name', OUTFIT_NAME_MAX);
  const occasion = optionalText(root, 'occasion', OUTFIT_OCCASION_MAX);
  const cover = optionalText(root, 'coverImagePath', COVER_KEY_MAX);
  if (!name.ok || !occasion.ok || !cover.ok) {
    return NextResponse.json({ error: 'invalid' }, { status: 400 });
  }
  if (typeof cover.value === 'string' && !isOwnedCoverKey(cover.value, authed.userId)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  // items is optional; when present it fully replaces the placement set.
  let members: ReturnType<typeof parseOutfitItems> = null;
  const replacingItems = 'items' in root && root.items !== undefined;
  if (replacingItems) {
    members = parseOutfitItems(root.items);
    if (!members) {
      return NextResponse.json({ error: 'invalid' }, { status: 400 });
    }
    if (!(await allItemsOwnedBy(db, authed.userId, members.map((m) => m.itemId)))) {
      return NextResponse.json({ error: 'unknown_items' }, { status: 400 });
    }
  }

  const setClause: Partial<typeof outfits.$inferInsert> = {};
  if (name.value !== undefined) {
    setClause.name = name.value;
  }
  if (occasion.value !== undefined) {
    setClause.occasion = occasion.value;
  }
  if (cover.value !== undefined) {
    setClause.coverImagePath = cover.value;
  }
  if (Object.keys(setClause).length > 0) {
    await db.update(outfits).set(setClause).where(eq(outfits.id, id));
  }
  if (members) {
    await replaceOutfitItems(db, id, members);
  }

  const [updated] = await db.select().from(outfits).where(eq(outfits.id, id)).limit(1);
  const owner = await ownerFor(authed.userId);
  const shaped = await shapeOutfitDetail(db, serverStorageClient(), authed.ctx, updated ?? existing, owner);
  return NextResponse.json({ outfit: { ...shaped, sharedPostId: await sharedPostIdFor(id) } });
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const authed = await authenticate(request);
  if (authed instanceof NextResponse) {
    return authed;
  }
  const { id } = await params;
  const outfit = await loadOwnedOutfit(id, authed.ctx);
  if (outfit instanceof NextResponse) {
    return outfit;
  }

  // Best-effort cleanup of the outfit's try-on render object BEFORE the row delete
  // cascades away the outfit_tryons row. The DB row cascades on its own, but the R2
  // object (in the avatars bucket, `${userId}/tryon/…`) does not, so sweep it here
  // by its exact key. A cleanup miss must never block the outfit delete — a leftover
  // object is later caught by the account-deletion `${userId}/` sweep.
  try {
    const [tryon] = await db
      .select({ imagePath: outfitTryons.imagePath })
      .from(outfitTryons)
      .where(eq(outfitTryons.outfitId, id))
      .limit(1);
    if (tryon?.imagePath) {
      const storage = serverStorageClient();
      await deleteObjectsUnderPrefix(storage, storage.config.buckets.avatars, tryon.imagePath);
    }
  } catch (error) {
    console.error('[era-tryon] outfit try-on render cleanup failed; continuing with delete:', error);
  }

  await db.delete(outfits).where(eq(outfits.id, id));
  return NextResponse.json({ success: true });
}
