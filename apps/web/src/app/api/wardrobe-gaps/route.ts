/**
 * The caller's genuine wardrobe gaps — the honest, restrained answer to "what am
 * I missing?", owner-scoped.
 *
 *   POST /api/wardrobe-gaps   (no body required)
 *
 * The server loads the caller's OWN closet, style profile, and recent wears and
 * runs the model-free gap engine (`findWardrobeGaps` from `@era/core/shop`). It
 * returns the genuine gaps — each with the outfits it would unlock, the owned
 * pieces it pairs with, and a pre-filtered `suggestedQuery` the client turns into
 * a tappable "fill this gap" Shop search.
 *
 * Deterministic and closet-grounded: there is NO Claude call here, so — unlike
 * the AI routes — nothing is metered (`ai_usage`) and there is no rate limit. A
 * gaps read never spends and never 429s. Auth mirrors /api/rank-products exactly:
 * the owner is the session user, never the body.
 *
 * Responses:
 *   - 401 { error: 'unauthenticated' }  no session
 *   - 403 { error: 'forbidden' }        cross-origin POST
 *   - 400 { error: 'invalid' }          body over the cap
 *   - 200 { gaps: WardrobeGap[] }
 */
import { NextResponse } from 'next/server';

import { type AuthContext, AuthzError, requireUser } from '@era/core';
import { createDbClient } from '@era/db';

import { auth } from '../../../lib/auth.ts';
import { loadWardrobeGaps } from '../../../lib/ovi-server.ts';
import { isSameOrigin } from '../../../lib/shop-query.ts';

const db = createDbClient(process.env.DATABASE_URL!);

/** Body cap — this route reads nothing from the body, so anything sizable is malformed. */
const MAX_BODY_BYTES = 4 * 1024;

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

  const gaps = await loadWardrobeGaps(db, userId);
  return NextResponse.json({ gaps }, { status: 200 });
}
