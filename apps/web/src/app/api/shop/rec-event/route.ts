/**
 * Log a Shop recommendation interaction.
 *
 *   POST /api/shop/rec-event  { kind, productId, retailer?, why? }
 *
 * Append-only signal for tuning Shop ranking: a `rec_click` (the user opened a
 * pick's retailer link) or a `rec_dismiss` (the user waved a pick away). One
 * `ai_events` row per call, owner-scoped, mirroring the outfit_accept idiom in
 * api/ovi/accept. Both kinds already exist in the `ai_event_kind` enum — no
 * migration. The payload carries NO PII: only the productId, the retailer name,
 * and the honest `why` label the card showed.
 *
 * Session-gated + same-origin + body-capped; the write is authorized through the
 * @era/core `canInsertAiEvent` owner check.
 *
 * Responses:
 *   - 401 { error: 'unauthenticated' }  no session
 *   - 403 { error: 'forbidden' }        cross-origin POST
 *   - 400 { error: 'invalid' }          body failed validation
 *   - 200 { logged: true }
 */
import { NextResponse } from 'next/server';

import { type AuthContext, AuthzError, canInsertAiEvent, requireUser } from '@era/core';
import { type AiEventKind, aiEvents, createDbClient } from '@era/db';

import { auth } from '../../../../lib/auth.ts';
import { isSameOrigin } from '../../../../lib/shop-query.ts';

const db = createDbClient(process.env.DATABASE_URL!);

/** Small body: a kind, an id, and two short labels. */
const MAX_BODY_BYTES = 2048;
/** Bound the stored strings (Sentinel LOW: bound stored text). */
const PRODUCT_ID_MAX = 200;
const RETAILER_MAX = 100;

/** The two Shop rec kinds this route accepts (a subset of ai_event_kind). */
const REC_KINDS: readonly AiEventKind[] = ['rec_click', 'rec_dismiss'];
/** The honest `why` labels a card can carry into the event, from Oracle's ProductWhy. */
const WHY_KINDS = ['completes_outfits', 'fills_gap', 'similar_owned'] as const;
type WhyKind = (typeof WHY_KINDS)[number];

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
  if (typeof body !== 'object' || body === null) {
    return NextResponse.json({ error: 'invalid' }, { status: 400 });
  }
  const root = body as Record<string, unknown>;

  if (!REC_KINDS.includes(root.kind as AiEventKind)) {
    return NextResponse.json({ error: 'invalid' }, { status: 400 });
  }
  const kind = root.kind as AiEventKind;

  if (typeof root.productId !== 'string' || root.productId.length === 0 || root.productId.length > PRODUCT_ID_MAX) {
    return NextResponse.json({ error: 'invalid' }, { status: 400 });
  }
  const productId = root.productId;

  let retailer: string | null = null;
  if (root.retailer !== undefined) {
    if (typeof root.retailer !== 'string' || root.retailer.length > RETAILER_MAX) {
      return NextResponse.json({ error: 'invalid' }, { status: 400 });
    }
    retailer = root.retailer.length > 0 ? root.retailer : null;
  }

  let why: WhyKind | null = null;
  if (root.why !== undefined) {
    if (!WHY_KINDS.includes(root.why as WhyKind)) {
      return NextResponse.json({ error: 'invalid' }, { status: 400 });
    }
    why = root.why as WhyKind;
  }

  // Owner-scoped, append-only write (never mutated once logged).
  try {
    canInsertAiEvent(ctx, { userId });
  } catch (error) {
    if (error instanceof AuthzError) {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 });
    }
    throw error;
  }

  await db.insert(aiEvents).values({
    userId,
    kind,
    payload: { productId, retailer, why },
  });

  return NextResponse.json({ logged: true }, { status: 200 });
}
