/**
 * GET /api/checkout/batches/[id] — the mobile poll for one checkout batch.
 *
 * Owner-scoped: refreshes every non-terminal member order (re-fetching its Rye intent
 * and persisting the fresh state + offer) and returns the members plus their combined
 * per-store + grand total (the review view shown before confirm). A batch that has no
 * members for this user — foreign, missing, or a malformed id — is an indistinguishable
 * 404.
 *
 * Gate order: flag → session → (uuid/ownership via refresh).
 *   - 404 { error: 'not_found' }        feature dormant, bad id, or foreign/missing batch
 *   - 401 { error: 'unauthenticated' }  no session
 *   - 200 { batchId, orders, combined }
 */
import { NextResponse } from 'next/server';

import { createDbClient } from '@era/db';

import { auth } from '../../../../../lib/auth.ts';
import { getCheckoutProvider, isCheckoutEnabledServer } from '../../../../../lib/checkout-provider.ts';
import { refreshBatch } from '../../../../../lib/checkout-server.ts';

const db = createDbClient(process.env.DATABASE_URL!);

/** checkout_batch_id is a pg uuid — a malformed id can't match, so treat it as 404 up front. */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  if (!isCheckoutEnabledServer()) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }
  const session = await auth.api.getSession({ headers: request.headers });
  const userId = session?.user.id;
  if (!userId) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  }
  const { id } = await params;
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }

  const view = await refreshBatch(userId, id, getCheckoutProvider(), db);
  if (view === null) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }
  return NextResponse.json({ batchId: id, orders: view.orders, combined: view.combined }, { status: 200 });
}
