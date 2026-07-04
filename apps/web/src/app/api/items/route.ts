/**
 * GET /api/items
 *
 * List the authenticated user's non-archived items, newest first, each with a
 * ready-to-render `displayUrl`. The URL is resolved through `getAssetUrl`, which
 * enforces visibility and signs private assets: it prefers the cutout when
 * present, else the raw original. The caller is always the owner here, so every
 * asset resolves (a private owner gets a short-lived presigned GET; a public one
 * gets the unsigned public cutout URL). Items with no stored image get a null
 * `displayUrl`.
 *
 * Each item also carries a `wearCount`: how many of the owner's wear logs
 * reference it (a placeholder-friendly real count — 0 until wear logging ships).
 *
 * Capped at 100 items. Presigning is local crypto (no network), so signing the
 * whole page is cheap.
 *
 * Responses:
 *   - 401 { error: 'unauthenticated' }  no session
 *   - 200 { items: [{ ...item, displayUrl, wearCount }] }
 */
import { and, desc, eq, getTableColumns, sql } from 'drizzle-orm';
import { NextResponse } from 'next/server';

import { type AssetBucket, type AuthContext, AuthzError, getAssetUrl, requireUser } from '@era/core';
import { createDbClient, items, profiles, wearLogs } from '@era/db';

import { auth } from '../../../lib/auth.ts';
import { serverStorageClient } from '../../../lib/storage-server.ts';

const db = createDbClient(process.env.DATABASE_URL!);

/** Maximum items returned per page. */
const ITEMS_LIMIT = 100;

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

  // The owner's profile privacy governs whether cutouts resolve to a public URL
  // or a presigned GET (raw is always presigned regardless).
  const [profile] = await db.select({ isPrivate: profiles.isPrivate }).from(profiles).where(eq(profiles.userId, userId)).limit(1);
  const isPrivate = profile?.isPrivate ?? true;

  // wearCount: how many of the owner's wear logs reference this item. Correlated
  // count subquery (item id ∈ the uuid[] item_ids), owner-scoped. Real but
  // currently a placeholder — no wear logs exist yet, so this is 0 for everyone.
  const wearCount = sql<number>`(
    select count(*)::int from ${wearLogs}
    where ${items.id} = any(${wearLogs.itemIds}) and ${wearLogs.userId} = ${userId}
  )`;

  const rows = await db
    .select({ ...getTableColumns(items), wearCount })
    .from(items)
    .where(and(eq(items.userId, userId), eq(items.archived, false)))
    .orderBy(desc(items.createdAt))
    .limit(ITEMS_LIMIT);

  const storage = serverStorageClient();
  const owner = { userId, isPrivate };
  const withUrls = await Promise.all(
    rows.map(async (item) => {
      const cutout = item.imageCutoutPath;
      const raw = item.imageRawPath;
      const bucket: AssetBucket = cutout ? 'items-cutout' : 'items-raw';
      const key = cutout ?? raw;
      const displayUrl = key ? await getAssetUrl(storage, ctx, { bucket, key, owner }) : null;
      return { ...item, displayUrl };
    }),
  );

  return NextResponse.json({ items: withUrls });
}
