/**
 * Rank a set of Shop products against the caller's own closet.
 *
 *   POST /api/rank-products  { products: ShopProduct[] }
 *
 * The client sends the products it just fetched from /api/shop-search; the server
 * loads the caller's closet + style profile and ranks them, attaching each pick's
 * honest `why` (fills_gap / completes_outfits / similar_owned). Deterministic and
 * closet-grounded today; a dormant Claude refinement path (behind a real
 * ANTHROPIC key + the per-user daily limit) is wired in `lib/shop-rank-server.ts`.
 *
 * A browse NEVER hard-fails: hitting the daily AI limit degrades to the
 * deterministic ranking (no 429), and the response shape is identical either way.
 *
 * Responses:
 *   - 401 { error: 'unauthenticated' }  no session
 *   - 403 { error: 'forbidden' }        cross-origin POST
 *   - 400 { error: 'invalid' }          body/products failed validation
 *   - 200 { products: RankedProduct[], source }
 */
import { eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';

import { type AuthContext, AuthzError, requireUser } from '@era/core';
import { type ShopProduct } from '@era/core/shop';
import { createDbClient, profiles } from '@era/db';

import { auth } from '../../../lib/auth.ts';
import { loadOviItems, loadStyleProfile } from '../../../lib/ovi-server.ts';
import { isSameOrigin, parseShopProduct } from '../../../lib/shop-query.ts';
import { attachWhyThumbnails, createItemThumbnailLookup, rankProductsForUser } from '../../../lib/shop-rank-server.ts';
import { serverStorageClient } from '../../../lib/storage-server.ts';

const db = createDbClient(process.env.DATABASE_URL!);

/** Ranking bounds a page of products; 40 comfortably covers two search pages. */
const MAX_PRODUCTS = 40;
/** Body cap — 40 self-describing product cards, generously bounded. */
const MAX_BODY_BYTES = 64 * 1024;

/** Parse and bound the products array, or null when malformed / over the cap. */
function parseProducts(value: unknown): ShopProduct[] | null {
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_PRODUCTS) {
    return null;
  }
  const out: ShopProduct[] = [];
  for (const raw of value) {
    const product = parseShopProduct(raw);
    if (!product) {
      return null;
    }
    out.push(product);
  }
  return out;
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

  if (!isSameOrigin(request)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const declaredLength = Number(request.headers.get('content-length'));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) {
    return NextResponse.json({ error: 'invalid' }, { status: 400 });
  }
  const rawBody = await request.text().catch(() => '');
  if (rawBody.length > MAX_BODY_BYTES) {
    return NextResponse.json({ error: 'invalid' }, { status: 400 });
  }

  let body: unknown;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'invalid' }, { status: 400 });
  }
  if (typeof body !== 'object' || body === null) {
    return NextResponse.json({ error: 'invalid' }, { status: 400 });
  }

  const products = parseProducts((body as Record<string, unknown>).products);
  if (!products) {
    return NextResponse.json({ error: 'invalid' }, { status: 400 });
  }

  // The owner's profile privacy governs whether their cutouts resolve to a public
  // URL or a presigned GET — the same rule the closet list uses. Default private
  // when no profile row exists yet.
  const [closet, styleProfile, [profile]] = await Promise.all([
    loadOviItems(db, userId),
    loadStyleProfile(db, userId),
    db.select({ isPrivate: profiles.isPrivate }).from(profiles).where(eq(profiles.userId, userId)).limit(1),
  ]);
  const isPrivate = profile?.isPrivate ?? true;

  const { products: ranked, source } = await rankProductsForUser(db, userId, products, closet, styleProfile);

  // Resolve each whyDetail ref's thumbnail from the caller's OWN closet cutouts
  // (owner-scoped, cutout-only; refs with no cutout keep imageUrl undefined).
  const lookup = createItemThumbnailLookup(db, serverStorageClient(), ctx, { userId, isPrivate });
  const withThumbnails = await attachWhyThumbnails(ranked, lookup);

  return NextResponse.json({ products: withThumbnails, source }, { status: 200 });
}
