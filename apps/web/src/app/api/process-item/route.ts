/**
 * POST /api/process-item  { rawKey: string }
 *
 * Turn a freshly-uploaded raw image (already PUT to R2 via /api/upload-url) into
 * a persisted items row. The enrichment + persistence work lives in the shared
 * {@link processItemPipeline} (see lib/item-pipeline.ts): background removal and
 * vision classification are both dormant until their provider key is configured,
 * and either failing only leaves its column empty — the item still saves with a
 * placeholder category/name so the client confirm screen can force a manual
 * review. The response `processed` flags tell the client which stages ran.
 *
 * This route owns only the HTTP concerns: session auth, request validation, the
 * owner-prefix guard on rawKey, and mapping pipeline errors to status codes. It
 * passes no rawBytes, so the pipeline fetches the raw object from R2 itself.
 *
 * Responses:
 *   - 401 { error: 'unauthenticated' }  no session
 *   - 400 { error: 'invalid' }          missing/blank rawKey
 *   - 403 { error: 'forbidden' }        rawKey not under the caller's prefix
 *   - 502 { error: 'raw_unavailable' }  the raw object could not be fetched
 *   - 500 { error: 'save_failed' }      persistence failed
 *   - 200 { item, processed: { bg, vision } }
 */
import { NextResponse } from 'next/server';

import { type AuthContext, AuthzError, requireUser } from '@era/core';
import { strings } from '@era/core/strings';
import { createDbClient } from '@era/db';

import { auth } from '../../../lib/auth.ts';
import { checkDailyLimit, checkGlobalAiGate, recordUsage } from '../../../lib/ai-usage.ts';
import { PipelineError, processItemPipeline } from '../../../lib/item-pipeline.ts';

const db = createDbClient(process.env.DATABASE_URL!);

export async function POST(request: Request): Promise<NextResponse> {
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

  const body: unknown = await request.json().catch(() => null);
  const rawKey = (body as { rawKey?: unknown } | null)?.rawKey;
  if (typeof rawKey !== 'string' || rawKey.length === 0) {
    return NextResponse.json({ error: 'invalid' }, { status: 400 });
  }
  // Same owner binding as getAssetUrl: the key must live under the caller's
  // prefix, so a caller can never process another user's object.
  if (!rawKey.startsWith(`${userId}/`)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  // Global AI brake (B3): the app-wide kill-switch, or the day's global spend at
  // or over the cap. When engaged we do NOT run the vision/bg-removal pipeline —
  // its provider calls are live AI spend. A soft, retryable 503: the raw upload
  // already sits in R2, so the piece is deferred (client can retry later), not
  // lost. Layered ABOVE the per-user limit below.
  const globalGate = await checkGlobalAiGate(db);
  if (!globalGate.open) {
    return NextResponse.json({ retryable: true, reason: 'ai_paused' }, { status: 503 });
  }

  // Per-user daily rate limit on the add-a-piece pipeline (vision + bg removal).
  const check = await checkDailyLimit(db, userId, 'process-item');
  if (!check.allowed) {
    return NextResponse.json({ error: 'daily_limit', message: strings.ovi.limitReachedProcessing }, { status: 429 });
  }

  try {
    const result = await processItemPipeline({ ctx }, { userId, rawKey, source: 'photo' });
    // Log the call: vision/bg are dormant, so model is null → $0, but the call
    // still counts against the daily limit. Best-effort; never fails the request.
    await recordUsage(db, userId, 'process-item', { model: null });
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof PipelineError) {
      const status = error.code === 'raw_unavailable' ? 502 : 500;
      return NextResponse.json({ error: error.code }, { status });
    }
    throw error;
  }
}
