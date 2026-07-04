/**
 * POST /api/ovi/reject   { itemIds: [...], intent?, name?, occasion?, rationale?, reason? }
 *
 * Record that the caller dismissed an outfit Ovi proposed. Nothing is saved — the
 * whole point is the append-only ai_events row of kind outfit_reject, which
 * captures the rejected proposal (its itemIds and context) as a negative signal
 * for later model tuning.
 *
 * itemIds are validated as UUIDs and capped, but NOT ownership-checked: the ids
 * were merely proposed and an item may have been deleted since, so this is a
 * pure event and must not hard-fail on a stale id. An empty array is allowed.
 *
 * Session-gated via the @era/core authz path (session → requireUser).
 *
 * Responses:
 *   - 401 { error: 'unauthenticated' }  no session
 *   - 400 { error: 'invalid' }          body/itemIds failed validation
 *   - 200 { success: true }             the reject event was recorded
 */
import { NextResponse } from 'next/server';

import { type AuthContext, AuthzError, requireUser } from '@era/core';
import { aiEvents, createDbClient } from '@era/db';

import { auth } from '../../../../lib/auth.ts';
import {
  OUTFIT_NAME_MAX,
  OUTFIT_OCCASION_MAX,
  optionalText,
  parseItemIds,
} from '../../../../lib/outfit-server.ts';

const db = createDbClient(process.env.DATABASE_URL!);

// A dismissed proposal may carry no ids (nothing to hard-fail on); still cap it.
const MIN_ITEMS = 0;
const MAX_ITEMS = 30;
// Length caps for the Ovi proposal context stored on the ai_events payload
// (Sentinel LOW: bound stored text).
const INTENT_MAX = 200;
const RATIONALE_MAX = 2000;
const REASON_MAX = 200;

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
  if (typeof body !== 'object' || body === null) {
    return NextResponse.json({ error: 'invalid' }, { status: 400 });
  }
  const root = body as Record<string, unknown>;

  const name = optionalText(root, 'name', OUTFIT_NAME_MAX);
  const occasion = optionalText(root, 'occasion', OUTFIT_OCCASION_MAX);
  const intent = optionalText(root, 'intent', INTENT_MAX);
  const rationale = optionalText(root, 'rationale', RATIONALE_MAX);
  const reason = optionalText(root, 'reason', REASON_MAX);
  if (!name.ok || !occasion.ok || !intent.ok || !rationale.ok || !reason.ok) {
    return NextResponse.json({ error: 'invalid' }, { status: 400 });
  }

  const itemIds = parseItemIds(root.itemIds, MIN_ITEMS, MAX_ITEMS);
  if (!itemIds) {
    return NextResponse.json({ error: 'invalid' }, { status: 400 });
  }

  await db.insert(aiEvents).values({
    userId,
    kind: 'outfit_reject',
    payload: {
      itemIds,
      intent: intent.value ?? null,
      name: name.value ?? null,
      occasion: occasion.value ?? null,
      rationale: rationale.value ?? null,
      reason: reason.value ?? null,
    },
  });

  return NextResponse.json({ success: true });
}
