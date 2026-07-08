/**
 * GET /api/wear-logs/stats?itemId=<uuid>
 *
 * Per-item wear stats for the item-detail card: how many times the caller has
 * worn this item, plus its purchase price (for a cost-per-wear read). Both come
 * from one owner-scoped query. The item must be the caller's own — a missing or
 * foreign id answers `unknown_item` (mirrors POST /api/wear-logs' unknown_items
 * idiom), so this never leaks another user's wardrobe.
 *
 * Responses:
 *   - 200 { itemId, wearCount, purchasePrice }
 *   - 401 { error: 'unauthenticated' }   no session
 *   - 400 { error: 'invalid' }           `itemId` missing or not a uuid
 *   - 400 { error: 'unknown_item' }      itemId is not the caller's
 */
import { NextResponse } from 'next/server';

import { type AuthContext, AuthzError, requireUser } from '@era/core';
import { createDbClient } from '@era/db';

import { auth } from '../../../../lib/auth.ts';
import { isUuid, loadItemWearStats } from '../../../../lib/wear-logs-server.ts';

const db = createDbClient(process.env.DATABASE_URL!);

export async function GET(request: Request): Promise<NextResponse> {
  // 1. Session required — the owner is the session user, never a query param.
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

  // 2. itemId must be a uuid — a non-uuid would surface as a Postgres 500.
  const itemId = new URL(request.url).searchParams.get('itemId');
  if (!isUuid(itemId)) {
    return NextResponse.json({ error: 'invalid' }, { status: 400 });
  }

  // 3. Owner-scoped stats; a non-owned item is indistinguishable from a missing
  //    one — both answer unknown_item.
  const stats = await loadItemWearStats(db, userId, itemId);
  if (!stats) {
    return NextResponse.json({ error: 'unknown_item' }, { status: 400 });
  }

  return NextResponse.json({ itemId, wearCount: stats.wearCount, purchasePrice: stats.purchasePrice });
}
