/**
 * POST /api/webhooks/rye
 *
 * Rye's checkout-intent webhook. Rye pushes a THIN event when an intent's state
 * changes; we verify the signature, then re-fetch the authoritative intent and fold it
 * onto the matching `orders` row. NOT session-guarded — it is called by Rye's servers —
 * so it authenticates by an HMAC-SHA256 signature over the RAW body, compared in
 * constant time (`verifyRyeSignature`).
 *
 * DORMANT until provisioned: unless a real `RYE_WEBHOOK_SECRET` is set, every call gets
 * 404 (the endpoint does not exist yet), so it is inert on a fresh deploy.
 *
 * The handshake + events:
 *   - `webhook_endpoint.verification_challenge` → reply `{ challenge: <source.id> }`.
 *   - `checkout_intent.*` → getIntent(source.id) → update the order row by intentId.
 *     A thin event carries only metadata, so we always re-fetch the full intent (the
 *     idempotent source of truth). An intent id that matches no row is dropped (200) —
 *     it may belong to another environment or a since-deleted order.
 * Processing failures are logged and swallowed — never thrown — and answered with a
 * fast 200 so Rye does not retry a permanently-broken delivery. Only an unverifiable
 * signature (or a dormant endpoint / oversized body) is refused.
 *
 * Responses:
 *   - 404 { error: 'not_found' }    dormant (no real webhook secret) or oversized body
 *   - 401 { error: 'unauthorized' } missing / invalid signature
 *   - 200 { challenge }             verification handshake
 *   - 200 { received: true }        every verified event (applied, dropped, or ignored)
 */
import { NextResponse } from 'next/server';

import { createDbClient } from '@era/db';

import { getCheckoutProvider } from '../../../../lib/checkout-provider.ts';
import { persistIntentByIntentId } from '../../../../lib/checkout-server.ts';
import { isRyeWebhookConfigured, verifyRyeSignature } from '../../../../lib/rye.ts';

const db = createDbClient(process.env.DATABASE_URL!);

/** Cap the raw webhook body — a Rye event is a small JSON object. */
const MAX_WEBHOOK_BODY_BYTES = 64 * 1024;

export async function POST(request: Request): Promise<NextResponse> {
  // Dormant until provisioned — short-circuit before touching the body.
  if (!isRyeWebhookConfigured()) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }
  const secret = process.env.RYE_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }

  // Bound the body before buffering — signature check runs on unauthenticated bytes.
  const declared = Number(request.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > MAX_WEBHOOK_BODY_BYTES) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }
  const rawBody = await request.text().catch(() => '');
  if (rawBody.length > MAX_WEBHOOK_BODY_BYTES) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }

  // Verify the HMAC signature in constant time before doing ANY work. Never log the secret.
  if (!verifyRyeSignature(rawBody, request.headers.get('x-rye-signature'), secret)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  // Parse. A verified-but-unparseable body is dropped (200) so Rye stops retrying it.
  let payload: { type?: unknown; source?: { id?: unknown } } | null;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    console.error('[era-checkout] Rye webhook: unparseable body — dropped');
    return NextResponse.json({ received: true }, { status: 200 });
  }

  const type = typeof payload?.type === 'string' ? payload.type : '';
  const sourceId = typeof payload?.source?.id === 'string' ? payload.source.id : '';

  // The setup handshake — echo the endpoint id back as the challenge.
  if (type === 'webhook_endpoint.verification_challenge') {
    return NextResponse.json({ challenge: sourceId }, { status: 200 });
  }

  // A checkout-intent state change — re-fetch the authoritative intent and persist it.
  if (type.startsWith('checkout_intent.') && sourceId.length > 0) {
    try {
      const intent = await getCheckoutProvider().getIntent(sourceId);
      const applied = await persistIntentByIntentId(db, sourceId, intent);
      if (!applied) {
        console.error('[era-checkout] Rye webhook: no order matched the intent — dropped');
      }
    } catch (error) {
      // Never throw out of a webhook — log the class and answer 200 so Rye moves on.
      console.error('[era-checkout] Rye webhook: processing failed:', error instanceof Error ? error.name : 'unknown');
    }
  }

  return NextResponse.json({ received: true }, { status: 200 });
}
