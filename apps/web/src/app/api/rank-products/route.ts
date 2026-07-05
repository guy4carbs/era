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
import { NextResponse } from 'next/server';

import { type AuthContext, AuthzError, requireUser } from '@era/core';
import {
  type BrandTier,
  type ItemCategory,
  type ShopProduct,
} from '@era/core/shop';
import { createDbClient } from '@era/db';

import { auth } from '../../../lib/auth.ts';
import { loadOviItems, loadStyleProfile } from '../../../lib/ovi-server.ts';
import { isHttpsUrl, isSameOrigin } from '../../../lib/shop-query.ts';
import { rankProductsForUser } from '../../../lib/shop-rank-server.ts';

const db = createDbClient(process.env.DATABASE_URL!);

/** Ranking bounds a page of products; 40 comfortably covers two search pages. */
const MAX_PRODUCTS = 40;
/** Body cap — 40 self-describing product cards, generously bounded. */
const MAX_BODY_BYTES = 64 * 1024;

const ITEM_CATEGORIES: readonly ItemCategory[] = [
  'top',
  'bottom',
  'dress',
  'outerwear',
  'shoes',
  'bag',
  'hat',
  'scarf',
  'watch',
  'jewelry',
  'accessory',
];
const BRAND_TIERS: readonly BrandTier[] = ['luxury', 'premium', 'contemporary', 'high_street'];

/** A non-empty string, else null. */
function nonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

/** An optional readonly string array (all entries strings), else undefined. */
function optionalStringArray(value: unknown): readonly string[] | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (!Array.isArray(value) || !value.every((entry) => typeof entry === 'string')) {
    return undefined;
  }
  return value as string[];
}

/**
 * Validate one untrusted product into a `ShopProduct`, or null when malformed.
 * Requires every card field: ids/strings non-empty, the two enums in range, and a
 * finite non-negative price. `sizes`/`colors` are optional. Ranking reads only
 * category + colors, but we validate the full card so the ranked response the UI
 * renders is well-formed.
 */
function parseProduct(value: unknown): ShopProduct | null {
  if (typeof value !== 'object' || value === null) {
    return null;
  }
  const p = value as Record<string, unknown>;

  const id = nonEmptyString(p.id);
  const title = nonEmptyString(p.title);
  const brand = nonEmptyString(p.brand);
  const currency = nonEmptyString(p.currency);
  const imageUrl = nonEmptyString(p.imageUrl);
  const retailer = nonEmptyString(p.retailer);
  const productUrl = nonEmptyString(p.productUrl);
  const affiliateUrl = nonEmptyString(p.affiliateUrl);
  if (!id || !title || !brand || !currency || !imageUrl || !retailer || !productUrl || !affiliateUrl) {
    return null;
  }
  if (!ITEM_CATEGORIES.includes(p.category as ItemCategory)) {
    return null;
  }
  if (!BRAND_TIERS.includes(p.brandTier as BrandTier)) {
    return null;
  }
  if (typeof p.price !== 'number' || !Number.isFinite(p.price) || p.price < 0) {
    return null;
  }
  // Scheme-injection guard: the link/image fields must be absolute https URLs.
  // These products are CLIENT-SUPPLIED, so a tampered `javascript:`/`data:` URL
  // must never pass validation and reach the rendered response. A non-https row
  // fails validation → parseProducts rejects the request (400); a legitimate
  // browse only ever forwards the https products shop-search already emitted.
  if (!isHttpsUrl(imageUrl) || !isHttpsUrl(productUrl) || !isHttpsUrl(affiliateUrl)) {
    return null;
  }

  return {
    id,
    title,
    brand,
    brandTier: p.brandTier as BrandTier,
    category: p.category as ItemCategory,
    price: p.price,
    currency,
    imageUrl,
    retailer,
    productUrl,
    affiliateUrl,
    sizes: optionalStringArray(p.sizes),
    colors: optionalStringArray(p.colors),
  };
}

/** Parse and bound the products array, or null when malformed / over the cap. */
function parseProducts(value: unknown): ShopProduct[] | null {
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_PRODUCTS) {
    return null;
  }
  const out: ShopProduct[] = [];
  for (const raw of value) {
    const product = parseProduct(raw);
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

  const [closet, styleProfile] = await Promise.all([loadOviItems(db, userId), loadStyleProfile(db, userId)]);

  const { products: ranked, source } = await rankProductsForUser(db, userId, products, closet, styleProfile);
  return NextResponse.json({ products: ranked, source }, { status: 200 });
}
