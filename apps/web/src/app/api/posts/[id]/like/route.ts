/**
 * Like / unlike a feed post.
 *
 *   POST   /api/posts/[id]/like  →  { liked: true,  likeCount }
 *   DELETE /api/posts/[id]/like  →  { liked: false, likeCount }
 *
 * The post must exist AND the viewer must not be blocked-either-way from its
 * creator (the shared `loadPostForViewer` gate); a blocked or absent post is an
 * indistinguishable 404. Idempotent: a repeat like is a no-op, an unlike with no
 * row matches nothing — either way the response carries the freshly counted
 * `likeCount`. Uncapped (documented accepted risk — the ranker's ln-damping blunts
 * count inflation).
 *
 * DORMANT behind `ERA_FEED_ENABLED` (404 while off).
 *
 * Responses:
 *   - 404 { error: 'not_found' }        feed dormant, OR post absent/blocked
 *   - 401 { error: 'unauthenticated' }  no session
 *   - 403 { error: 'forbidden' }        cross-origin request
 *   - 200 { liked, likeCount }
 */
import { NextResponse } from 'next/server';

import { createDbClient } from '@era/db';

import { auth } from '../../../../../lib/auth.ts';
import { isFeedEnabledServer } from '../../../../../lib/feed-server.ts';
import { countLikes, likePost, loadPostForViewer, unlikePost } from '../../../../../lib/post-engagement-server.ts';
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
  await likePost(db, id, gated.userId);
  return NextResponse.json({ liked: true, likeCount: await countLikes(db, id) }, { status: 200 });
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const { id } = await params;
  const gated = await gate(request, id);
  if (gated instanceof NextResponse) {
    return gated;
  }
  await unlikePost(db, id, gated.userId);
  return NextResponse.json({ liked: false, likeCount: await countLikes(db, id) }, { status: 200 });
}
