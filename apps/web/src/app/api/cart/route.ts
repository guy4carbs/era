/**
 * The cross-store cart — list / add / remove the pieces a user is gathering before
 * ONE in-flow checkout.
 *
 *   GET    /api/cart                                   → { items, groups }
 *   POST   /api/cart  { product: ShopProduct, size?, quantity? }  → { added }
 *   DELETE /api/cart  { cartItemId }                    → { deleted }
 *
 * Flag-gated: the entire surface 404s unless `ERA_CHECKOUT_ENABLED` is 'true' (the
 * tryon-route idiom) — a dormant deploy has no cart. Session-gated (401), same-origin
 * on the mutating verbs (403), body-capped + validated (400). Owner-scoped throughout:
 * `userId` is ALWAYS the session's.
 *
 * GET returns each item with a per-item `support` flag (in_flow vs handoff, from the
 * checkout provider's allowlist) plus the per-retailer grouping + subtotals so the UI
 * can render one section per store with the separate-shipments truth. Products come
 * from the external affiliate feed (no table to FK to), so a cart row is a
 * denormalized ShopProduct snapshot validated with the same `parseShopProduct` guard
 * as the shop routes — a tampered `javascript:`/`data:` URL never lands in the cart.
 * Re-adding the same product is idempotent (onConflictDoNothing).
 *
 * Responses:
 *   - 404 { error: 'not_found' }         feature dormant
 *   - 401 { error: 'unauthenticated' }   no session
 *   - 403 { error: 'forbidden' }         cross-origin (POST/DELETE)
 *   - 400 { error: 'invalid' }           body failed validation
 *   - 200 payload
 */
import { NextResponse } from 'next/server';

import { type AuthContext, AuthzError, requireUser } from '@era/core';
import { type CheckoutCartItem, groupCartByRetailer } from '@era/core/checkout';
import { SIZE_OPTIONS } from '@era/core/shop';
import { type CartItem, createDbClient, cartItems } from '@era/db';
import { and, eq } from 'drizzle-orm';

import { auth } from '../../../lib/auth.ts';
import { getCheckoutProvider, isCheckoutEnabledServer } from '../../../lib/checkout-provider.ts';
import { cartRowToShopProduct } from '../../../lib/checkout-server.ts';
import { isSameOrigin, parseShopProduct } from '../../../lib/shop-query.ts';

const db = createDbClient(process.env.DATABASE_URL!);

/** A cart body carries one product snapshot — cap it a touch above the shop body cap. */
const MAX_BODY_BYTES = 4 * 1024;
/** A sane upper bound on quantity for a single cart line. */
const MAX_QUANTITY = 99;

const SIZE_SET = new Set<string>(SIZE_OPTIONS);

/** Resolve the caller's id, or a 401. */
async function authenticate(request: Request): Promise<{ userId: string } | NextResponse> {
  const sessionResult = await auth.api.getSession({ headers: request.headers });
  const ctx: AuthContext = { userId: sessionResult?.user.id ?? null };
  try {
    return { userId: requireUser(ctx) };
  } catch (error) {
    if (error instanceof AuthzError) {
      return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
    }
    throw error;
  }
}

/** Read the capped JSON object body, or null (→ 400). */
async function readBody(request: Request): Promise<Record<string, unknown> | null> {
  const declaredLength = Number(request.headers.get('content-length'));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) {
    return null;
  }
  const rawBody = await request.text().catch(() => '');
  if (rawBody.length > MAX_BODY_BYTES) {
    return null;
  }
  let body: unknown;
  try {
    body = rawBody.length > 0 ? JSON.parse(rawBody) : {};
  } catch {
    return null;
  }
  if (typeof body !== 'object' || body === null) {
    return null;
  }
  return body as Record<string, unknown>;
}

/** Map a cart row to the minimal shape the pure cart math consumes. */
function toCheckoutCartItem(row: CartItem): CheckoutCartItem {
  return {
    retailer: row.retailer,
    priceSnapshotCents: row.priceSnapshotCents,
    currency: row.currency,
    quantity: row.quantity,
    category: row.category ?? undefined,
  };
}

export async function GET(request: Request): Promise<NextResponse> {
  if (!isCheckoutEnabledServer()) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }
  const authed = await authenticate(request);
  if (authed instanceof NextResponse) {
    return authed;
  }

  const rows = await db.select().from(cartItems).where(eq(cartItems.userId, authed.userId)).orderBy(cartItems.addedAt);
  const provider = getCheckoutProvider();

  const items = rows.map((row) => ({
    // The row handle the client keys on and passes back to DELETE — named
    // `cartItemId` end to end (GET emits it, DELETE consumes it) so the cart
    // contract is self-consistent across the client/server boundary.
    cartItemId: row.id,
    productId: row.productId,
    retailer: row.retailer,
    title: row.title,
    brand: row.brand,
    imageUrl: row.imageUrl,
    productUrl: row.productUrl,
    affiliateUrl: row.affiliateUrl,
    category: row.category,
    priceSnapshotCents: row.priceSnapshotCents,
    currency: row.currency,
    size: row.size,
    quantity: row.quantity,
    support: provider.supports(cartRowToShopProduct(row)),
  }));
  const groups = groupCartByRetailer(rows.map(toCheckoutCartItem));

  return NextResponse.json({ items, groups }, { status: 200 });
}

export async function POST(request: Request): Promise<NextResponse> {
  if (!isCheckoutEnabledServer()) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }
  const authed = await authenticate(request);
  if (authed instanceof NextResponse) {
    return authed;
  }
  if (!isSameOrigin(request)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const body = await readBody(request);
  if (!body) {
    return NextResponse.json({ error: 'invalid' }, { status: 400 });
  }
  // The product snapshot is validated by the same guard the shop routes use — every
  // link/image field must be an absolute https URL, both enums in range.
  const product = parseShopProduct(body.product);
  if (!product) {
    return NextResponse.json({ error: 'invalid' }, { status: 400 });
  }

  // Optional size — when present it must be a known size chip.
  let size: string | null = null;
  if (body.size !== undefined && body.size !== null) {
    if (typeof body.size !== 'string' || !SIZE_SET.has(body.size)) {
      return NextResponse.json({ error: 'invalid' }, { status: 400 });
    }
    size = body.size;
  }

  // Optional quantity — a positive integer within a sane bound (default 1).
  let quantity = 1;
  if (body.quantity !== undefined) {
    if (typeof body.quantity !== 'number' || !Number.isInteger(body.quantity) || body.quantity < 1 || body.quantity > MAX_QUANTITY) {
      return NextResponse.json({ error: 'invalid' }, { status: 400 });
    }
    quantity = body.quantity;
  }

  const inserted = await db
    .insert(cartItems)
    .values({
      userId: authed.userId,
      productId: product.id,
      retailer: product.retailer,
      title: product.title,
      brand: product.brand,
      imageUrl: product.imageUrl,
      productUrl: product.productUrl,
      affiliateUrl: product.affiliateUrl,
      category: product.category,
      priceSnapshotCents: Math.round(product.price * 100),
      currency: product.currency,
      size,
      quantity,
    })
    .onConflictDoNothing()
    .returning({ id: cartItems.id });

  // Idempotent: a re-add of the same product conflicts on (userId, productId) and is a no-op.
  return NextResponse.json({ added: inserted.length > 0 }, { status: 200 });
}

export async function DELETE(request: Request): Promise<NextResponse> {
  if (!isCheckoutEnabledServer()) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }
  const authed = await authenticate(request);
  if (authed instanceof NextResponse) {
    return authed;
  }
  if (!isSameOrigin(request)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const body = await readBody(request);
  if (!body || typeof body.cartItemId !== 'string' || body.cartItemId.length === 0) {
    return NextResponse.json({ error: 'invalid' }, { status: 400 });
  }

  // Owner-scoped delete: a foreign or missing id simply removes nothing.
  const deleted = await db
    .delete(cartItems)
    .where(and(eq(cartItems.id, body.cartItemId), eq(cartItems.userId, authed.userId)))
    .returning({ id: cartItems.id });

  return NextResponse.json({ deleted: deleted.length > 0 }, { status: 200 });
}
