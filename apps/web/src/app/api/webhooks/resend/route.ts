/**
 * POST /api/webhooks/resend
 *
 * Resend's delivery-event webhook, signed with Svix. NOT session-guarded — it is
 * called by Resend's servers, not a browser — so it is authenticated by the Svix
 * signature over the RAW request body. The webhook secret is OPTIONAL and the
 * route is DORMANT until it is provisioned: with `RESEND_WEBHOOK_SECRET` unset
 * (or the committed `change-me-…` placeholder) every call gets 503 and no work
 * runs, so the endpoint is inert on a fresh deploy. Same dormant-credential idiom
 * as `lib/send-email.ts` and `api/cron/price-check`.
 *
 * On a verified event we care about exactly two kinds:
 *   - `email.bounced`    (a hard bounce) → suppress the address ('bounced')
 *   - `email.complained` (a spam report) → suppress the address ('complained')
 * Both INSERT the lowercased recipient into `email_suppressions`
 * (`onConflictDoNothing`, so a repeat event is a no-op) — the send path checks
 * that table before every email. Every other verified event (`email.delivered`,
 * `email.opened`, …) is accepted and ignored. We ALWAYS return 200 on a verified
 * event, handled or not, so Resend never retries a good delivery.
 *
 * This handler is a THIN ADAPTER: the decision + suppression logic lives in
 * `lib/resend-webhook.ts` (unit-tested there, free of `next/server`). The route
 * only reads the RAW body + Svix headers off the Request — bounding the size
 * BEFORE buffering — and maps the returned `{ status, body }` onto a response.
 *
 * Responses:
 *   - 503 { error: 'webhook not configured' }  RESEND_WEBHOOK_SECRET unset/placeholder
 *   - 401 { error: 'unauthorized' }            missing/oversized/bad signature
 *   - 200 { received: true }                   verified — suppressed or ignored
 */
import { NextResponse } from 'next/server';

import {
  MAX_WEBHOOK_BODY_BYTES,
  handleResendWebhook,
  isWebhookConfigured,
  type SvixHeaders,
} from '../../../../lib/resend-webhook.ts';

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
  if (!isWebhookConfigured(process.env)) {
    return NextResponse.json({ error: 'webhook not configured' }, { status: 503 });
  }

  // Cheap pre-read guard: reject a declared-oversized body before buffering it.
  const declaredLength = Number(request.headers.get('content-length'));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_WEBHOOK_BODY_BYTES) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  // Read the RAW body BEFORE parsing — Svix verifies over the exact bytes.
  const rawBody = await request.text().catch(() => '');
  const result = await handleResendWebhook({ rawBody, headers: svixHeaders(request) });
  return NextResponse.json(result.body, { status: result.status });
}
