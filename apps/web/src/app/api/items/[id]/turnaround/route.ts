/**
 * AI turnaround views for one item — the multi-angle render set behind the closet
 * detail view.
 *
 *   GET  /api/items/[id]/turnaround  →  TurnaroundState
 *   POST /api/items/[id]/turnaround  →  TurnaroundState   (starts/idempotently resumes a run)
 *
 * POST takes NO body — the item id is in the path. Generation is Gemini + Claude
 * vision QA (see turnaround-server.ts); a run is idempotent on the item's job row.
 *
 * DORMANT behind `ERA_TURNAROUND_ENABLED` (404 while off, same posture as the feed
 * / Era+ routes). GET works even when the item's category is turnaround-disabled —
 * it returns `categoryEnabled: false` so the client hides the affordance; POST
 * refuses a disabled category.
 *
 * Check order (both verbs): flag → session → [POST: same-origin] → uuid → ownership.
 *
 * Responses:
 *   - 404 { error: 'not_found' }          feature dormant, bad id, or item missing/unowned
 *   - 401 { error: 'unauthenticated' }    no session
 *   - 403 { error: 'forbidden' }          cross-origin POST
 *   - 400 { error: 'category_disabled' }  POST: turnaround off for this category
 *   - 400 { error: 'no_cutout' }          POST: item has no cutout to render from
 *   - 503 { error: 'unavailable' }        POST: Gemini not configured
 *   - 429 { error: 'daily_limit' }        POST: per-user daily run cap reached
 *   - 409 { error: 'already_running' }    POST: a run is already in flight
 *   - 502 { error: 'generation_failed' }  POST: generation produced nothing
 *   - 200 TurnaroundState
 */
import { and, eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';

import { type AuthContext } from '@era/core';
import { type Item, createDbClient, items } from '@era/db';

import { auth } from '../../../../../lib/auth.ts';
import { isSameOrigin } from '../../../../../lib/shop-query.ts';
import {
  checkTurnaroundDailyLimit,
  getTurnaroundState,
  isTurnaroundEnabledServer,
  runTurnaround,
  turnaroundCategories,
} from '../../../../../lib/turnaround-server.ts';
import { isGeminiConfigured } from '../../../../../lib/gemini-image.ts';
import { isTurnaroundCategoryEnabled } from '@era/core/turnaround-flags';

const db = createDbClient(process.env.DATABASE_URL!);

/** items.id is a pg uuid. */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}

/** Load the item scoped to its owner — a missing OR foreign id is an indistinguishable 404 (no ownership oracle). */
async function loadOwnedItem(userId: string, id: string): Promise<Item | undefined> {
  const [item] = await db
    .select()
    .from(items)
    .where(and(eq(items.id, id), eq(items.userId, userId)))
    .limit(1);
  return item;
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  if (!isTurnaroundEnabledServer()) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }
  const session = await auth.api.getSession({ headers: request.headers });
  const userId = session?.user.id;
  if (!userId) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  }
  const { id } = await params;
  if (!isUuid(id)) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }
  const item = await loadOwnedItem(userId, id);
  if (!item) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }

  const ctx: AuthContext = { userId };
  const state = await getTurnaroundState(db, ctx, userId, item.id, item.category);
  return NextResponse.json(state);
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  if (!isTurnaroundEnabledServer()) {
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
  const { id } = await params;
  if (!isUuid(id)) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }
  const item = await loadOwnedItem(userId, id);
  if (!item) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }

  if (!isTurnaroundCategoryEnabled(item.category, turnaroundCategories())) {
    return NextResponse.json({ error: 'category_disabled' }, { status: 400 });
  }
  if (!item.imageCutoutPath) {
    return NextResponse.json({ error: 'no_cutout' }, { status: 400 });
  }
  if (!isGeminiConfigured()) {
    return NextResponse.json({ error: 'unavailable' }, { status: 503 });
  }
  const cap = await checkTurnaroundDailyLimit(db, userId);
  if (!cap.allowed) {
    return NextResponse.json({ error: 'daily_limit' }, { status: 429 });
  }

  const ctx: AuthContext = { userId };
  const result = await runTurnaround(ctx, userId, item, db);
  if (!result.ok) {
    if (result.code === 'already_running') {
      return NextResponse.json({ error: 'already_running' }, { status: 409 });
    }
    return NextResponse.json({ error: 'generation_failed' }, { status: 502 });
  }
  return NextResponse.json(result.state);
}
