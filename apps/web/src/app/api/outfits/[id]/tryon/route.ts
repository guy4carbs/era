/**
 * Virtual try-on for one saved outfit — render the outfit onto the caller's avatar.
 *
 *   GET  /api/outfits/[id]/tryon  →  TryonState  (with `stale`)
 *   POST /api/outfits/[id]/tryon  →  TryonState  (starts/idempotently resumes a render)
 *
 * POST takes NO body — the outfit id is in the path. The render chains FASHN try-on
 * calls (base layer → outerwear → shoes) onto the avatar base image; a run is
 * idempotent on the outfit's render row and cached until the outfit's garment set
 * changes (`stale`). This is the FIRST plus-gated action route.
 *
 * DORMANT behind `ERA_TRYON_ENABLED` (404 while off). GET is the client poll/resume
 * path and returns `stale` so the client can offer an explicit "update render".
 *
 * Gate order — POST: flag → session → origin → Era+ → uuid/ownership → avatar ready
 * → non-empty chain → FASHN configured → monthly cap → claim/render. GET: flag →
 * session → uuid/ownership.
 *
 * Responses:
 *   - 404 { error: 'not_found' }          feature dormant, bad id, or outfit missing/unowned
 *   - 401 { error: 'unauthenticated' }    no session
 *   - 403 { error: 'forbidden' }          cross-origin POST
 *   - 403 { error: 'plus_required' }      POST: not an Era+ subscriber
 *   - 409 { error: 'no_avatar' }          POST: no avatar, or it isn't ready yet
 *   - 400 { error: 'no_garments' }        POST: nothing renderable in this outfit
 *   - 503 { error: 'unavailable' }        POST: FASHN not configured
 *   - 429 { error: 'monthly_limit', used, limit }  POST: monthly render cap reached
 *   - 409 { error: 'already_running' }    POST: a render is already in flight
 *   - 502 { error: 'generation_failed' }  POST: the render failed
 *   - 200 TryonState
 */
import { and, eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';

import { type AuthContext } from '@era/core';
import { avatars, createDbClient, outfits } from '@era/db';

import { auth } from '../../../../../lib/auth.ts';
import { getUserPlusState } from '../../../../../lib/plus-server.ts';
import { isSameOrigin } from '../../../../../lib/shop-query.ts';
import { isFashnConfigured } from '../../../../../lib/fashn.ts';
import {
  checkTryonMonthlyLimit,
  currentTryonSignature,
  getTryonState,
  isTryonEnabledServer,
  loadTryonChainItems,
  planTryonExecution,
  runTryon,
} from '../../../../../lib/tryon-server.ts';

const db = createDbClient(process.env.DATABASE_URL!);

/** outfits.id is a pg uuid. */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}

/** True when the caller owns an outfit with this id — a missing OR foreign id is an indistinguishable false. */
async function ownsOutfit(userId: string, outfitId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: outfits.id })
    .from(outfits)
    .where(and(eq(outfits.id, outfitId), eq(outfits.userId, userId)))
    .limit(1);
  return Boolean(row);
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  if (!isTryonEnabledServer()) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }
  const session = await auth.api.getSession({ headers: request.headers });
  const userId = session?.user.id;
  if (!userId) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  }
  const { id } = await params;
  if (!isUuid(id) || !(await ownsOutfit(userId, id))) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }

  const ctx: AuthContext = { userId };
  const chainItems = await loadTryonChainItems(db, userId, id);
  const state = await getTryonState(db, ctx, id, userId, currentTryonSignature(chainItems));
  return NextResponse.json(state);
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  if (!isTryonEnabledServer()) {
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
  const plus = await getUserPlusState(db, userId);
  if (!plus.isPlus) {
    return NextResponse.json({ error: 'plus_required' }, { status: 403 });
  }
  const { id } = await params;
  if (!isUuid(id) || !(await ownsOutfit(userId, id))) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }

  // The avatar must exist and be ready before it can be dressed.
  const [avatar] = await db
    .select({ status: avatars.status, baseImagePath: avatars.baseImagePath })
    .from(avatars)
    .where(eq(avatars.userId, userId))
    .limit(1);
  if (!avatar || avatar.status !== 'ready' || !avatar.baseImagePath) {
    return NextResponse.json({ error: 'no_avatar' }, { status: 409 });
  }

  const chainItems = await loadTryonChainItems(db, userId, id);
  const signature = currentTryonSignature(chainItems);
  const plannedSteps = planTryonExecution(chainItems);
  const plannedCalls = plannedSteps.length;
  // Empty chain OR a chain with no base layer both reject BEFORE the claim and
  // before any vendor spend: completion requires a rendered base (dress/top/
  // bottom), so a shoes-only outfit would burn credits on a run that is failed
  // by rule. Gauge gate: never spend on a doomed chain.
  if (plannedCalls === 0 || !plannedSteps.some((step) => step.isBase)) {
    return NextResponse.json({ error: 'no_garments' }, { status: 400 });
  }

  if (!isFashnConfigured()) {
    return NextResponse.json({ error: 'unavailable' }, { status: 503 });
  }
  const cap = await checkTryonMonthlyLimit(db, userId, plannedCalls);
  if (!cap.allowed) {
    return NextResponse.json({ error: 'monthly_limit', used: cap.used, limit: cap.limit }, { status: 429 });
  }

  const ctx: AuthContext = { userId };
  const result = await runTryon(ctx, userId, id, avatar.baseImagePath, chainItems, signature, db);
  if (!result.ok) {
    if (result.code === 'already_running') {
      return NextResponse.json({ error: 'already_running' }, { status: 409 });
    }
    return NextResponse.json({ error: 'generation_failed' }, { status: 502 });
  }
  return NextResponse.json(result.state);
}
