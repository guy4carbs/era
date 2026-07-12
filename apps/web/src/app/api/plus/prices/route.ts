/**
 * Display prices for the Era+ paywall.
 *
 *   GET /api/plus/prices  ->  { monthly: PlusDisplayPrice, annual: PlusDisplayPrice }
 *
 * The paywall's ONLY source of money figures: amounts are read from the two
 * configured Stripe Prices at request time, never hardcoded in copy — so what
 * the page shows can never drift from what Stripe charges. The annual `savings`
 * line is computed from the real prices and included only when annual is
 * genuinely cheaper (see `fetchPlusDisplayPrices`); the page renders price-free
 * cards whenever this endpoint has nothing honest to say.
 *
 * DORMANT until Era+ is enabled AND Stripe is fully provisioned — same gate as
 * the other /api/plus routes: anything less than flag + real key + both real
 * prices is a 404.
 *
 * Caching and Stripe access live in `getPlusDisplayPrices` (plus-server.ts),
 * shared with the `/plus` server component — one cache, one read path. This
 * route exists for clients that can't render server-side (and as the price
 * surface the mobile app can consult when steering to web checkout).
 *
 * Responses:
 *   - 404 { error: 'not_found' }     feature dormant / Stripe unprovisioned
 *   - 502 { error: 'stripe_error' }  Stripe unreachable / prices unrenderable
 *   - 200 { monthly, annual }        display-formatted, Stripe-sourced
 */
import { NextResponse } from 'next/server';

import { getPlusDisplayPrices, isPlusEnabledServer } from '../../../../lib/plus-server.ts';
import { isStripeConfigured } from '../../../../lib/plus-stripe.ts';

export async function GET(): Promise<NextResponse> {
  // Dormant: invisible until the flag is on and the whole Stripe surface is real.
  if (!isPlusEnabledServer() || !isStripeConfigured()) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }

  // Shared cached read (same path the /plus server component uses — one cache,
  // one Stripe read). We're past the dormant gate, so null here means Stripe
  // failed or the configured prices are unrenderable — an operator problem.
  const prices = await getPlusDisplayPrices();
  if (!prices) {
    return NextResponse.json({ error: 'stripe_error' }, { status: 502 });
  }
  return NextResponse.json(prices);
}
