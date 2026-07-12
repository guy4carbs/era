/**
 * Open the Stripe customer billing portal for an Era+ subscriber.
 *
 *   POST /api/plus/portal  ->  { url }
 *
 * DORMANT until Era+ is enabled AND Stripe is provisioned (404 otherwise).
 *
 * Live path: session-gate, confirm the caller is a Stripe subscriber, resolve
 * their Stripe customer id, create a billing-portal session, and return its
 * `url`. Only Stripe-store subscribers have a portal here — App Store / Play
 * Store subscribers manage billing in their store, so those resolve `no_portal`.
 *
 * Customer-id resolution: prefer the id persisted on the `subscriptions` row; if
 * it's missing (the RevenueCat webhook creates the row without it), recover it by
 * Stripe metadata search — the customer was stamped with `app_user_id` at
 * checkout — and heal the row. See `plus-stripe.ts`.
 *
 * Responses:
 *   - 404 { error: 'not_found' }        feature/Stripe dormant (the default today)
 *   - 401 { error: 'unauthenticated' }  no session
 *   - 403 { error: 'forbidden' }        cross-origin POST
 *   - 409 { error: 'no_portal' }        not a Stripe subscriber (store-managed / none)
 *   - 200 { url }                       Stripe billing-portal URL
 */
import { NextResponse } from 'next/server';

import { createDbClient } from '@era/db';

import { auth } from '../../../../lib/auth.ts';
import { getUserPlusState, isPlusEnabledServer } from '../../../../lib/plus-server.ts';
import {
  createPortalSession,
  findOrCreateStripeCustomer,
  getStripe,
  isStripeConfigured,
  persistStripeCustomerId,
} from '../../../../lib/plus-stripe.ts';

const db = createDbClient(process.env.DATABASE_URL!);

/**
 * Same-origin guard for this mutating POST (same idiom as api/delete-account). A
 * browser Origin must match the request host; a missing Origin (non-browser
 * client) is allowed — the session gate is the real authorization.
 */
function isSameOrigin(request: Request): boolean {
  const origin = request.headers.get('origin');
  if (!origin) return true;
  const host = request.headers.get('host');
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

export async function POST(request: Request): Promise<NextResponse> {
  // Dormant: invisible until Era+ is switched on AND Stripe is provisioned.
  if (!isPlusEnabledServer() || !isStripeConfigured()) {
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

  const stripe = getStripe();
  if (!stripe) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }

  // The subscription row tells us whether they're a Stripe subscriber and holds
  // the customer id when we've persisted it.
  const { subscription } = await getUserPlusState(db, userId);
  if (!subscription || (subscription.store !== 'stripe' && !subscription.stripeCustomerId)) {
    // Never subscribed, or an App Store / Play Store subscriber — no Stripe portal.
    return NextResponse.json({ error: 'no_portal' }, { status: 409 });
  }

  // Resolve the customer id: the persisted one, else recover by metadata search
  // (for a Stripe subscriber whose row predates the persisted id) and heal it. A
  // real Stripe subscriber always has a customer created at checkout, so the
  // search hits and no spurious customer is created.
  let customerId = subscription.stripeCustomerId;
  if (!customerId) {
    customerId = await findOrCreateStripeCustomer(stripe, { userId, email: session.user.email ?? undefined });
    await persistStripeCustomerId(db, userId, customerId);
  }

  const url = await createPortalSession(stripe, customerId);
  return NextResponse.json({ url });
}
