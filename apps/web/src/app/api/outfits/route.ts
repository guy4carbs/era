/**
 * POST /api/outfits   { name?, occasion?, items: [...], coverImagePath? }
 * GET  /api/outfits
 *
 * POST saves a new outfit: the scalar fields plus its canvas placements
 * (outfit_items). Every itemId must belong to the caller (no cross-user items),
 * and a supplied coverImagePath must live under the caller's `{userId}/` prefix.
 *
 * GET lists the caller's outfits newest-first (capped), each with a coverUrl
 * (when a cover is set), an itemCount, and up to four member-item thumbnail
 * displayUrls for a fallback collage when there is no cover.
 *
 * Both are session-gated via the @era/core authz path (session → requireUser).
 *
 * POST responses:
 *   - 401 { error: 'unauthenticated' }  no session
 *   - 400 { error: 'invalid' }          body/items failed validation
 *   - 400 { error: 'unknown_items' }    an itemId is missing or not the caller's
 *   - 403 { error: 'forbidden' }        coverImagePath not under the caller's prefix
 *   - 201 { outfit }                    the inserted outfits row
 * GET responses:
 *   - 401 { error: 'unauthenticated' }
 *   - 200 { outfits: [{ ...outfit, coverUrl, itemCount, thumbnailUrls }] }
 */
import { asc, desc, eq, getTableColumns, inArray } from 'drizzle-orm';
import { NextResponse } from 'next/server';

import { type AuthContext, AuthzError, requireUser } from '@era/core';
import { createDbClient, items, outfitItems, outfits, profiles } from '@era/db';

import { auth } from '../../../lib/auth.ts';
import {
  COVER_KEY_MAX,
  OUTFIT_NAME_MAX,
  OUTFIT_OCCASION_MAX,
  allItemsOwnedBy,
  coverUrl,
  isOwnedCoverKey,
  itemDisplayUrl,
  optionalText,
  parseOutfitItems,
} from '../../../lib/outfit-server.ts';
import { livePostIdsByOutfit } from '../../../lib/posts-server.ts';
import { serverStorageClient } from '../../../lib/storage-server.ts';

const db = createDbClient(process.env.DATABASE_URL!);

/** Maximum outfits returned per page. */
const OUTFITS_LIMIT = 100;
/** Member-item thumbnails included per outfit for the fallback collage. */
const THUMBNAILS_PER_OUTFIT = 4;

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

  const members = parseOutfitItems(root.items);
  if (!members) {
    return NextResponse.json({ error: 'invalid' }, { status: 400 });
  }

  // Owner-prefix guard: a cover can only be one the caller uploaded, and it must
  // match the exact minted key shape (rejects `..` traversal past the prefix).
  if (typeof cover.value === 'string' && !isOwnedCoverKey(cover.value, userId)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  if (!(await allItemsOwnedBy(db, userId, members.map((m) => m.itemId)))) {
    return NextResponse.json({ error: 'unknown_items' }, { status: 400 });
  }

  const [outfit] = await db
    .insert(outfits)
    .values({
      userId,
      name: name.value ?? null,
      occasion: occasion.value ?? null,
      coverImagePath: cover.value ?? null,
      isAiGenerated: false,
    })
    .returning();
  if (!outfit) {
    return NextResponse.json({ error: 'save_failed' }, { status: 500 });
  }

  await db.insert(outfitItems).values(members.map((m) => ({ outfitId: outfit.id, ...m })));

  return NextResponse.json({ outfit }, { status: 201 });
}

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
  const owner = { userId, isPrivate: profile?.isPrivate ?? true };

  const rows = await db
    .select(getTableColumns(outfits))
    .from(outfits)
    .where(eq(outfits.userId, userId))
    .orderBy(desc(outfits.createdAt))
    .limit(OUTFITS_LIMIT);

  const storage = serverStorageClient();

  // One pass to fetch every member's image paths (ordered), then group per
  // outfit for itemCount + the first few thumbnails — avoids an N+1 per outfit.
  const outfitIds = rows.map((o) => o.id);
  // Which of the caller's own outfits are live on the feed — one batched query so
  // each card can hydrate its share toggle (unconditional: it's the caller's own
  // data, and the partial unique index guarantees ≤1 live post per outfit).
  const sharedPostIds = await livePostIdsByOutfit(db, outfitIds);
  const memberRows = outfitIds.length
    ? await db
        .select({
          outfitId: outfitItems.outfitId,
          imageCutoutPath: items.imageCutoutPath,
          imageRawPath: items.imageRawPath,
        })
        .from(outfitItems)
        .innerJoin(items, eq(outfitItems.itemId, items.id))
        .where(inArray(outfitItems.outfitId, outfitIds))
        .orderBy(asc(outfitItems.outfitId), asc(outfitItems.layerOrder))
    : [];

  const byOutfit = new Map<string, { count: number; thumbs: { imageCutoutPath: string | null; imageRawPath: string | null }[] }>();
  for (const row of memberRows) {
    const bucket = byOutfit.get(row.outfitId) ?? { count: 0, thumbs: [] };
    bucket.count += 1;
    if (bucket.thumbs.length < THUMBNAILS_PER_OUTFIT) {
      bucket.thumbs.push({ imageCutoutPath: row.imageCutoutPath, imageRawPath: row.imageRawPath });
    }
    byOutfit.set(row.outfitId, bucket);
  }

  const list = await Promise.all(
    rows.map(async (outfit) => {
      const bucket = byOutfit.get(outfit.id) ?? { count: 0, thumbs: [] };
      const thumbnailUrls = (await Promise.all(bucket.thumbs.map((t) => itemDisplayUrl(storage, ctx, t, owner)))).filter(
        (u): u is string => u !== null,
      );
      return {
        ...outfit,
        coverUrl: await coverUrl(storage, ctx, outfit.coverImagePath, owner),
        itemCount: bucket.count,
        thumbnailUrls,
        sharedPostId: sharedPostIds.get(outfit.id) ?? null,
      };
    }),
  );

  return NextResponse.json({ outfits: list });
}
