/**
 * GET /api/checkout/orders — the caller's order history, newest first.
 *
 * The settings-surface list of every in-flow order the user has placed (across all
 * batches). Owner-scoped: `userId` is ALWAYS the session's.
 *
 * Gate order: flag → session.
 *   - 404 { error: 'not_found' }        feature dormant
 *   - 401 { error: 'unauthenticated' }  no session
 *   - 200 { orders }
 */
import { NextResponse } from 'next/server';

import { createDbClient } from '@era/db';

import { auth } from '../../../../lib/auth.ts';
import { isCheckoutEnabledServer } from '../../../../lib/checkout-provider.ts';
import { listOrders } from '../../../../lib/checkout-server.ts';

const db = createDbClient(process.env.DATABASE_URL!);

export async function GET(request: Request): Promise<NextResponse> {
  if (!isCheckoutEnabledServer()) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }
  const session = await auth.api.getSession({ headers: request.headers });
  const userId = session?.user.id;
  if (!userId) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  }

  const orders = await listOrders(db, userId);
  return NextResponse.json({ orders }, { status: 200 });
}
