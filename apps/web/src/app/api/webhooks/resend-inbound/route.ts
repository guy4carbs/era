/**
 * POST /api/webhooks/resend-inbound
 *
 * Resend's INBOUND-email webhook (`email.received`), signed with Svix. NOT
 * session-guarded — it is called by Resend's servers — so it is authenticated by
 * the Svix signature over the RAW request body, using a SEPARATE secret from the
 * outbound delivery webhook (`RESEND_INBOUND_WEBHOOK_SECRET`; a separate endpoint
 * gets its own secret). The secret is OPTIONAL and the route is DORMANT until it
 * is provisioned: unset (or the committed `change-me-…` placeholder) → every call
 * gets 503 and no work runs, so the endpoint is inert on a fresh deploy. Same
 * dormant idiom as `api/webhooks/resend` and `api/cron/price-check`.
 *
 * The event is metadata-only; the body is fetched on a second hop and the import
 * is deduped by `data.email_id`. All of that decision + processing logic lives in
 * `lib/resend-inbound-webhook.ts` (unit-tested there, free of `next/server`). This
 * route only reads the RAW body + Svix headers — bounding the size BEFORE
 * buffering — and maps the returned `{ status, body }` onto a response.
 *
 * Responses (minimal, content-free bodies — never an address, token, or body):
 *   - 503 { error: 'webhook not configured' }  secret unset/placeholder
 *   - 401 { error: 'unauthorized' }            missing/oversized/bad signature
 *   - 500 { error: 'retry' }                   body second-hop failed transiently
 *   - 200 { received: true }                   verified — imported or no-op
 */
import { NextResponse } from 'next/server';

import {
  MAX_INBOUND_WEBHOOK_BODY_BYTES,
  handleInboundWebhook,
  isInboundWebhookConfigured,
} from '../../../../lib/resend-inbound-webhook.ts';
import type { SvixHeaders } from '../../../../lib/resend-webhook.ts';

/** Read the three Svix signature headers off the request (empty when absent). */
function svixHeaders(request: Request): SvixHeaders {
  return {
    'svix-id': request.headers.get('svix-id') ?? '',
    'svix-timestamp': request.headers.get('svix-timestamp') ?? '',
    'svix-signature': request.headers.get('svix-signature') ?? '',
  };
}

export async function POST(request: Request): Promise<NextResponse> {
  // Dormant until provisioned — short-circuit before touching the body.
  if (!isInboundWebhookConfigured(process.env)) {
    return NextResponse.json({ error: 'webhook not configured' }, { status: 503 });
  }

  // Cheap pre-read guard: reject a declared-oversized body before buffering it.
  const declaredLength = Number(request.headers.get('content-length'));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_INBOUND_WEBHOOK_BODY_BYTES) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  // Read the RAW body BEFORE parsing — Svix verifies over the exact bytes.
  const rawBody = await request.text().catch(() => '');
  const result = await handleInboundWebhook({ rawBody, headers: svixHeaders(request) });
  return NextResponse.json(result.body, { status: result.status });
}
