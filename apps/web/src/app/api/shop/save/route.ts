/**
 * Save / unsave a Shop product (wishlist, save-for-later).
 *
 *   POST   /api/shop/save    { product: ShopProduct }   → { saved: true }
 *   DELETE /api/shop/save    { productId: string }       → { saved: false }
 *
 * A saved row is a denormalized snapshot of the product at save time (Shop feeds
 * are external with no table to FK to). Save is idempotent — a re-save of the same
 * product is dropped by the `(user_id, product_id)` unique constraint, so the
 * toggle can fire freely. Both writes are owner-scoped: authorized through the
 * `@era/core` `canInsertSavedProduct` / `canDeleteSavedProduct` guards and filtered
 * by `userId` in the query.
 *
 * Session-gated + same-origin + body-capped, mirroring api/shop/rec-event. The
 * product is validated with the SAME audited `parseShopProduct` the rank-products
 * route uses — a non-https image/link field is rejected (400), so nothing tainted
 * is ever persisted. Server-only; no secrets logged.
 *
 * Responses:
 *   - 401 { error: 'unauthenticated' }  no session
 *   - 403 { error: 'forbidden' }        cross-origin request / non-owner
 *   - 400 { error: 'invalid' }          body failed validation
 *   - 200 { saved: boolean }
 */
import { NextResponse } from 'next/server';

import { type AuthContext, AuthzError, canDeleteSavedProduct, canInsertSavedProduct, requireUser } from '@era/core';
import { createDbClient } from '@era/db';

import { auth } from '../../../../lib/auth.ts';
import { saveProduct, unsaveProduct } from '../../../../lib/saved-products-server.ts';
import { isSameOrigin, parseShopProduct } from '../../../../lib/shop-query.ts';

const db = createDbClient(process.env.DATABASE_URL!);

/** One product card in, or one id out — small either way. */
const MAX_BODY_BYTES = 8 * 1024;
/** Bound the stored/handled id (mirrors rec-event's PRODUCT_ID_MAX). */
const PRODUCT_ID_MAX = 200;

/** Resolve the caller's id, or an error response. Shared by POST and DELETE. */
async function authorize(request: Request): Promise<{ userId: string; ctx: AuthContext } | NextResponse> {
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
  return { userId, ctx };
}

/** Read the capped JSON object body, or null (→ 400) on any failure. */
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
    body = JSON.parse(rawBody);
  } catch {
    return null;
  }
  if (typeof body !== 'object' || body === null) {
    return null;
  }
  return body as Record<string, unknown>;
}

export async function POST(request: Request): Promise<NextResponse> {
  const authed = await authorize(request);
  if (authed instanceof NextResponse) {
    return authed;
  }
  const { userId, ctx } = authed;

  const body = await readBody(request);
  if (!body) {
    return NextResponse.json({ error: 'invalid' }, { status: 400 });
  }
  const product = parseShopProduct(body.product);
  if (!product) {
    return NextResponse.json({ error: 'invalid' }, { status: 400 });
  }

  try {
    canInsertSavedProduct(ctx, { userId });
  } catch (error) {
    if (error instanceof AuthzError) {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 });
    }
    throw error;
  }

  await saveProduct(db, userId, product);
  return NextResponse.json({ saved: true }, { status: 200 });
}

export async function DELETE(request: Request): Promise<NextResponse> {
  const authed = await authorize(request);
  if (authed instanceof NextResponse) {
    return authed;
  }
  const { userId, ctx } = authed;

  const body = await readBody(request);
  if (!body) {
    return NextResponse.json({ error: 'invalid' }, { status: 400 });
  }
  if (typeof body.productId !== 'string' || body.productId.length === 0 || body.productId.length > PRODUCT_ID_MAX) {
    return NextResponse.json({ error: 'invalid' }, { status: 400 });
  }
  const productId = body.productId;

  try {
    canDeleteSavedProduct(ctx, { userId });
  } catch (error) {
    if (error instanceof AuthzError) {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 });
    }
    throw error;
  }

  await unsaveProduct(db, userId, productId);
  return NextResponse.json({ saved: false }, { status: 200 });
}
