/**
 * "Shop similar from my closet" for a feed post.
 *
 *   GET /api/posts/[id]/shop-similar  →  { slots: [{ slot, posted:{category,colors}, matches:[…] }] }
 *
 * For each item in the posted look, the viewer's own top-matching closet pieces
 * (deterministic, no LLM — the trust rule: show what the closet already answers
 * before Shop suggests buying). Each match carries the VIEWER's item + its display
 * URL. An empty closet returns slots with empty `matches` (the client shows its
 * "find the gap in Shop" empty state).
 *
 * The post is gated exactly like like/save: absent OR blocked-either-way → 404
 * (indistinguishable). Read-only, so no same-origin guard.
 *
 * DORMANT behind `ERA_FEED_ENABLED` (404 while off).
 *
 * Responses:
 *   - 404 { error: 'not_found' }        feed dormant, OR post absent/blocked
 *   - 401 { error: 'unauthenticated' }  no session
 *   - 200 { slots }
 */
import { NextResponse } from 'next/server';

import { createDbClient } from '@era/db';

import { auth } from '../../../../../lib/auth.ts';
import { isFeedEnabledServer } from '../../../../../lib/feed-server.ts';
import { loadPostForViewer } from '../../../../../lib/post-engagement-server.ts';
import { loadShopSimilar } from '../../../../../lib/shop-similar-server.ts';
import { serverStorageClient } from '../../../../../lib/storage-server.ts';

const db = createDbClient(process.env.DATABASE_URL!);

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  if (!isFeedEnabledServer()) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }
  const session = await auth.api.getSession({ headers: request.headers });
  const userId = session?.user.id;
  if (!userId) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  }

  const { id } = await params;
  const post = await loadPostForViewer(db, id, userId);
  if (post === null) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }

  const slots = await loadShopSimilar(db, serverStorageClient(), userId, { outfitId: post.outfitId, eraId: post.eraId });
  return NextResponse.json({ slots });
}
