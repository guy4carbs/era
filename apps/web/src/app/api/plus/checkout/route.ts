/**
 * Start an Era+ subscription checkout.
 *
 *   POST /api/plus/checkout  { plan: 'monthly' | 'annual' }  ->  { url }
 *
 * DORMANT until Era+ is enabled AND the whole Stripe surface (secret key + both
 * plan prices) is provisioned — a half-configured env must never sell one plan
 * and 500 on the other. While dormant the endpoint does not exist (404), so the
 * client's calm error state handles it.
 *
 * Live path: session-gate, validate the plan, find-or-create the caller's Stripe
 * customer (stamped with `app_user_id` so RevenueCat can unify the purchase),
 * open a hosted Checkout Session for the plan's price, and return its `url`. The
 * subscription state itself is reconciled by the RevenueCat webhook, never here.
 *
 * Responses:
 *   - 404 { error: 'not_found' }        feature/Stripe dormant (the default today)
 *   - 401 { error: 'unauthenticated' }  no session
 *   - 403 { error: 'forbidden' }        cross-origin POST
 *   - 400 { error: 'invalid' }          plan is not 'monthly' | 'annual'
 *   - 502 { error: 'checkout_failed' }  Stripe returned no hosted-checkout URL
 *   - 200 { url }                       hosted Stripe Checkout URL
 */
import { NextResponse } from 'next/server';

import { createDbClient } from '@era/db';

import { auth } from '../../../../lib/auth.ts';
import { isPlusEnabledServer } from '../../../../lib/plus-server.ts';
import {
  createPlusCheckoutSession,
  findOrCreateStripeCustomer,
  getStripe,
  isStripeConfigured,
  persistStripeCustomerId,
  stripePriceForPlan,
  type PlusPlan,
} from '../../../../lib/plus-stripe.ts';

const db = createDbClient(process.env.DATABASE_URL!);

/** The two purchasable Era+ plans. */
const PLANS = ['monthly', 'annual'] as const satisfies readonly PlusPlan[];

/** A small body: just the chosen plan. */
const MAX_BODY_BYTES = 1024;

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
  // Dormant: invisible until Era+ is switched on AND Stripe is fully provisioned.
  if (!isPlusEnabledServer() || !isStripeConfigured()) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }

  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user.id) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
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
  const plan = (body as { plan?: unknown } | null)?.plan;
  if (typeof plan !== 'string' || !PLANS.includes(plan as PlusPlan)) {
    return NextResponse.json({ error: 'invalid' }, { status: 400 });
  }

  // isStripeConfigured guaranteed both are non-null; narrow for the type-checker.
  const stripe = getStripe();
  const priceId = stripePriceForPlan(plan as PlusPlan);
  if (!stripe || !priceId) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }

  const userId = session.user.id;
  const customerId = await findOrCreateStripeCustomer(stripe, { userId, email: session.user.email ?? undefined });
  // Best-effort UPDATE-only persist (no row yet before the first purchase → a
  // no-op; the portal recovers the id by metadata search). See plus-stripe.ts.
  await persistStripeCustomerId(db, userId, customerId);

  const url = await createPlusCheckoutSession(stripe, { userId, customerId, priceId });
  if (!url) {
    return NextResponse.json({ error: 'checkout_failed' }, { status: 502 });
  }
  return NextResponse.json({ url });
}
