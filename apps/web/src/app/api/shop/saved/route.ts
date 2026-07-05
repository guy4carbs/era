/**
 * List the authenticated user's saved Shop products (wishlist), newest first.
 *
 *   GET /api/shop/saved  → { products: SavedShopProduct[] }
 *
 * Each entry is a stored `saved_products` row mapped to a render-friendly,
 * ShopProduct-like shape (see {@link SavedShopProduct}) so Nova (web) and Harbor
 * (mobile) render a saved card with the same components as a browse card. The read
 * is owner-scoped: authorized through the `@era/core` `canReadSavedProduct` guard
 * and filtered by `userId`. Server-only; no secrets logged.
 *
 * Responses:
 *   - 401 { error: 'unauthenticated' }  no session
 *   - 200 { products: SavedShopProduct[] }
 */
import { NextResponse } from 'next/server';

import { type AuthContext, AuthzError, canReadSavedProduct, requireUser } from '@era/core';
import { createDbClient } from '@era/db';

import { auth } from '../../../../lib/auth.ts';
import { listSavedProducts } from '../../../../lib/saved-products-server.ts';

const db = createDbClient(process.env.DATABASE_URL!);

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

  try {
    canReadSavedProduct(ctx, { userId });
  } catch (error) {
    if (error instanceof AuthzError) {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 });
    }
    throw error;
  }

  const products = await listSavedProducts(db, userId);
  return NextResponse.json({ products }, { status: 200 });
}
