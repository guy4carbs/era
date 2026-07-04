/**
 * POST /api/ovi/accept   { name?, occasion?, itemIds: [...], intent?, rationale? }
 *
 * Save an outfit Ovi proposed. The proposal carries bare itemIds (no canvas
 * placements), so this inserts an outfits row with is_ai_generated = true and one
 * outfit_items row per id, laid out with default center transforms (posX/posY
 * 0.5, scale 1, rotation 0) — an AI outfit is not hand-arranged; the canvas can
 * reopen and rearrange it later. Every itemId must belong to the caller (no
 * cross-user items). The accept is also recorded as an append-only ai_events row
 * of kind outfit_accept, capturing the proposal context (intent, rationale) for
 * later model tuning.
 *
 * Session-gated via the @era/core authz path (session → requireUser).
 *
 * Responses:
 *   - 401 { error: 'unauthenticated' }  no session
 *   - 400 { error: 'invalid' }          body/itemIds failed validation
 *   - 400 { error: 'unknown_items' }    an itemId is missing or not the caller's
 *   - 500 { error: 'save_failed' }      the outfit insert returned no row
 *   - 201 { outfit }                    the inserted outfits row
 */
import { NextResponse } from 'next/server';

import { type AuthContext, AuthzError, requireUser } from '@era/core';
import { aiEvents, createDbClient, outfitItems, outfits } from '@era/db';

import { auth } from '../../../../lib/auth.ts';
import {
  OUTFIT_NAME_MAX,
  OUTFIT_OCCASION_MAX,
  allItemsOwnedBy,
  optionalText,
  parseItemIds,
} from '../../../../lib/outfit-server.ts';

const db = createDbClient(process.env.DATABASE_URL!);

// Proposal size bounds mirror the outfit_items contract: 1..30 items.
const MIN_ITEMS = 1;
const MAX_ITEMS = 30;
// Default name when the proposal (or the user) supplies none.
const DEFAULT_NAME = 'Ovi look';
// Length caps for the Ovi proposal context stored on the ai_events payload
// (Sentinel LOW: bound stored text).
const INTENT_MAX = 200;
const RATIONALE_MAX = 2000;

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
  if (!name.ok || !occasion.ok || !intent.ok || !rationale.ok) {
    return NextResponse.json({ error: 'invalid' }, { status: 400 });
  }

  const itemIds = parseItemIds(root.itemIds, MIN_ITEMS, MAX_ITEMS);
  if (!itemIds) {
    return NextResponse.json({ error: 'invalid' }, { status: 400 });
  }

  if (!(await allItemsOwnedBy(db, userId, itemIds))) {
    return NextResponse.json({ error: 'unknown_items' }, { status: 400 });
  }

  const [outfit] = await db
    .insert(outfits)
    .values({
      userId,
      name: name.value ?? DEFAULT_NAME,
      occasion: occasion.value ?? null,
      isAiGenerated: true,
      coverImagePath: null,
    })
    .returning();
  if (!outfit) {
    return NextResponse.json({ error: 'save_failed' }, { status: 500 });
  }

  // AI outfits aren't hand-arranged: every member sits at the canvas center in
  // proposal order, ready to be rearranged when the outfit is reopened.
  await db.insert(outfitItems).values(
    itemIds.map((itemId, index) => ({
      outfitId: outfit.id,
      itemId,
      layerOrder: index,
      posX: 0.5,
      posY: 0.5,
      scale: 1,
      rotation: 0,
    })),
  );

  await db.insert(aiEvents).values({
    userId,
    kind: 'outfit_accept',
    payload: {
      outfitId: outfit.id,
      itemIds,
      intent: intent.value ?? null,
      rationale: rationale.value ?? null,
      name: outfit.name,
      occasion: outfit.occasion,
    },
  });

  return NextResponse.json({ outfit }, { status: 201 });
}
