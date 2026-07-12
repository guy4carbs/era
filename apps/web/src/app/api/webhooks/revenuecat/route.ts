/**
 * POST /api/webhooks/revenuecat
 *
 * RevenueCat's subscription webhook. RC is the single source of entitlement
 * truth for both platforms (iOS IAP direct; web Stripe purchases forwarded via
 * RC's Stripe integration); this endpoint receives RC's events and writes the
 * Neon `subscriptions` cache. NOT session-guarded — it is called by RC's servers
 * — so it is authenticated by the fixed `Authorization` header value configured
 * in the RC dashboard (`REVENUECAT_WEBHOOK_AUTH_TOKEN`), compared in constant
 * time. The token is OPTIONAL and the route is DORMANT until Era+ is switched on:
 * unless `ERA_PLUS_ENABLED` is 'true' AND a real token is set, every call gets
 * 404, so the endpoint is inert on a fresh deploy.
 *
 * All decision + processing logic lives in `lib/revenuecat-webhook.ts` (unit-
 * tested there, free of `next/server`). This route only reads the RAW body +
 * Authorization header — bounding the size BEFORE buffering — and maps the
 * returned `{ status, body }` onto a response.
 *
 * Responses (minimal, content-free bodies — never a token or payload):
 *   - 404 { error: 'not found' }     flag off or no real auth token (dormant)
 *   - 401 { error: 'unauthorized' }  missing/mismatched Authorization
 *   - 200 { received: true }         accepted — applied, skipped, or no-op
 */
import { NextResponse } from 'next/server';

import {
  MAX_REVENUECAT_WEBHOOK_BODY_BYTES,
  handleRevenueCatWebhook,
  isRevenueCatWebhookConfigured,
} from '../../../../lib/revenuecat-webhook.ts';

export async function POST(request: Request): Promise<NextResponse> {
  // Dormant until provisioned — short-circuit before touching the body.
  if (!isRevenueCatWebhookConfigured(process.env)) {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }

  // Pre-read guard, and it must be STRICT: this runs before auth, so
  // `request.text()` below buffers unauthenticated bytes. RevenueCat always
  // declares content-length; a missing/zero/oversized declaration is rejected
  // here so an attacker can't stream an unbounded chunked body into memory
  // (Sentinel N2). The post-read length check in the handler stays as the
  // backstop against a dishonest declaration.
  const declared = request.headers.get('content-length');
  const declaredLength = Number(declared);
  if (
    declared === null ||
    !Number.isFinite(declaredLength) ||
    declaredLength <= 0 ||
    declaredLength > MAX_REVENUECAT_WEBHOOK_BODY_BYTES
  ) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const rawBody = await request.text().catch(() => '');
  const result = await handleRevenueCatWebhook({
    rawBody,
    authorization: request.headers.get('authorization'),
  });
  return NextResponse.json(result.body, { status: result.status });
}
