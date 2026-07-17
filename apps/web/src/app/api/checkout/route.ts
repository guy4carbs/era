/**
 * POST /api/checkout — the ONE checkout action across the cross-store cart.
 *
 * Mints a batch of sibling orders (one per in-flow-supported cart item) via Rye, each
 * a real checkout intent resolving a real offer. Unsupported items are left in the
 * cart untouched — the client shows their affiliate handoff. Each store still ships
 * and bills its own order; there is no universal checkout.
 *
 * Gate order (the tryon-route idiom): flag → session → origin → address → cart →
 * supported → daily cap → mint.
 *   - 404 { error: 'not_found' }        feature dormant (`ERA_CHECKOUT_ENABLED` off)
 *   - 401 { error: 'unauthenticated' }  no session
 *   - 403 { error: 'forbidden' }        cross-origin
 *   - 409 { error: 'no_address' }       no saved shipping address to place an order to
 *   - 400 { error: 'empty_cart' }       nothing in the cart
 *   - 400 { error: 'unsupported_only' } cart has items but none are in-flow supported
 *   - 429 { error: 'daily_limit', used, limit }  per-user daily order cap reached
 *   - 201 { batchId, orders: [{ orderId?, productId, status, note? }] }
 *
 * A per-item vendor failure does NOT fail the request — that order row is marked
 * failed and the batch still returns 201 with honest per-store statuses.
 */
import { NextResponse } from 'next/server';

import type { CheckoutBuyer } from '@era/core/checkout';
import { createDbClient, cartItems, shippingAddresses } from '@era/db';
import { eq } from 'drizzle-orm';

import { auth } from '../../../lib/auth.ts';
import { getCheckoutProvider, isCheckoutEnabledServer } from '../../../lib/checkout-provider.ts';
import { cartRowToShopProduct, checkCheckoutDailyLimit, createCheckoutBatch } from '../../../lib/checkout-server.ts';
import { isSameOrigin } from '../../../lib/shop-query.ts';

const db = createDbClient(process.env.DATABASE_URL!);

export async function POST(request: Request): Promise<NextResponse> {
  if (!isCheckoutEnabledServer()) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }
  const session = await auth.api.getSession({ headers: request.headers });
  const userId = session?.user.id;
  if (!userId) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  }
  if (!isSameOrigin(request)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  // A shipping address is required to place any order.
  const [address] = await db.select().from(shippingAddresses).where(eq(shippingAddresses.userId, userId)).limit(1);
  if (!address) {
    return NextResponse.json({ error: 'no_address' }, { status: 409 });
  }

  const rows = await db.select().from(cartItems).where(eq(cartItems.userId, userId));
  if (rows.length === 0) {
    return NextResponse.json({ error: 'empty_cart' }, { status: 400 });
  }

  const provider = getCheckoutProvider();
  const supported = rows.filter((row) => provider.supports(cartRowToShopProduct(row)) === 'in_flow');
  if (supported.length === 0) {
    return NextResponse.json({ error: 'unsupported_only' }, { status: 400 });
  }

  const cap = await checkCheckoutDailyLimit(db, userId);
  if (!cap.allowed) {
    return NextResponse.json({ error: 'daily_limit', used: cap.used, limit: cap.limit }, { status: 429 });
  }

  // Assemble the buyer from the saved address + the session email. Buyer PII never
  // comes from the request body.
  const buyer: CheckoutBuyer = {
    firstName: address.firstName,
    lastName: address.lastName,
    email: session.user.email ?? '',
    phone: address.phone,
    address1: address.address1,
    address2: address.address2 ?? undefined,
    city: address.city,
    province: address.province,
    postalCode: address.postalCode,
    country: address.country,
  };

  const result = await createCheckoutBatch(userId, supported, buyer, provider, db);
  return NextResponse.json(
    {
      batchId: result.batchId,
      orders: result.orders.map((order) => ({ orderId: order.orderId, productId: order.productId, status: order.status, note: order.note })),
    },
    { status: 201 },
  );
}
