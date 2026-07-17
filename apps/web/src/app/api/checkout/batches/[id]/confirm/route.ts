/**
 * POST /api/checkout/batches/[id]/confirm — the explicit purchase for one batch.
 *
 * Confirms every member order (which must ALL be awaiting_confirmation) with the
 * sandbox test payment token; a completed member clears its cart row. Takes NO body —
 * the batch id is in the path.
 *
 * HARD LAUNCH SEAM — this route confirms real orders ONLY under Rye's sandbox. When
 * `ERA_CHECKOUT_SANDBOX` is not exactly 'true' it returns 503 `not_configured` and
 * confirms NOTHING: live payment tokenization (client-side Stripe, Era stays SAQ-A) is
 * a separate launch gate, so flipping this on is a deliberate operator step, loudly
 * documented here and in CLAUDE.md. Never let this route place a live-money order until
 * that gate is met.
 *
 * Gate order: flag → session → origin → sandbox → confirm.
 *   - 404 { error: 'not_found' }         feature dormant, bad id, or foreign/missing batch
 *   - 401 { error: 'unauthenticated' }   no session
 *   - 403 { error: 'forbidden' }         cross-origin
 *   - 503 { error: 'not_configured' }    ERA_CHECKOUT_SANDBOX not 'true' (the live-payment seam)
 *   - 409 { error: 'invalid_state', orders }  a member isn't awaiting_confirmation
 *   - 200 { orders }                     confirmed (honest per-store statuses)
 */
import { NextResponse } from 'next/server';

import { createDbClient } from '@era/db';

import { auth } from '../../../../../../lib/auth.ts';
import { getCheckoutProvider, isCheckoutEnabledServer } from '../../../../../../lib/checkout-provider.ts';
import { confirmBatch } from '../../../../../../lib/checkout-server.ts';
import { isCheckoutSandbox } from '../../../../../../lib/rye.ts';
import { isSameOrigin } from '../../../../../../lib/shop-query.ts';

const db = createDbClient(process.env.DATABASE_URL!);

/** checkout_batch_id is a pg uuid — a malformed id can't match, so treat it as 404 up front. */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
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
  // The live-payment launch seam: confirm only under Rye's sandbox with the test token.
  if (!isCheckoutSandbox()) {
    return NextResponse.json({ error: 'not_configured' }, { status: 503 });
  }
  const { id } = await params;
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }

  const result = await confirmBatch(userId, id, getCheckoutProvider(), db);
  if (!result.ok) {
    if (result.code === 'not_found') {
      return NextResponse.json({ error: 'not_found' }, { status: 404 });
    }
    return NextResponse.json({ error: 'invalid_state', orders: result.orders }, { status: 409 });
  }
  return NextResponse.json({ orders: result.orders }, { status: 200 });
}
