/**
 * Save / unsave a feed post.
 *
 *   POST   /api/posts/[id]/save  →  { saved: true,  saveCount }
 *   DELETE /api/posts/[id]/save  →  { saved: false, saveCount }
 *
 * Identical contract to the like route (see it for the gate + idempotency notes):
 * the post must exist and its creator must not be blocked either way, the write is
 * idempotent, and the response carries the live `saveCount`. Uncapped.
 *
 * DORMANT behind `ERA_FEED_ENABLED` (404 while off).
 *
 * Responses:
 *   - 404 { error: 'not_found' }        feed dormant, OR post absent/blocked
 *   - 401 { error: 'unauthenticated' }  no session
 *   - 403 { error: 'forbidden' }        cross-origin request
 *   - 200 { saved, saveCount }
 */
import { NextResponse } from 'next/server';

import { createDbClient } from '@era/db';

import { auth } from '../../../../../lib/auth.ts';
import { isFeedEnabledServer } from '../../../../../lib/feed-server.ts';
import { countSaves, loadPostForViewer, savePost, unsavePost } from '../../../../../lib/post-engagement-server.ts';
import { isSameOrigin } from '../../../../../lib/shop-query.ts';

const db = createDbClient(process.env.DATABASE_URL!);

/** flag → session → same-origin → post gate, or the matching error response. */
async function gate(request: Request, postId: string): Promise<{ userId: string } | NextResponse> {
  if (!isFeedEnabledServer()) {
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
  const post = await loadPostForViewer(db, postId, userId);
  if (post === null) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }
  return { userId };
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const { id } = await params;
  const gated = await gate(request, id);
  if (gated instanceof NextResponse) {
    return gated;
  }
  await savePost(db, id, gated.userId);
  return NextResponse.json({ saved: true, saveCount: await countSaves(db, id) }, { status: 200 });
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const { id } = await params;
  const gated = await gate(request, id);
  if (gated instanceof NextResponse) {
    return gated;
  }
  await unsavePost(db, id, gated.userId);
  return NextResponse.json({ saved: false, saveCount: await countSaves(db, id) }, { status: 200 });
}
