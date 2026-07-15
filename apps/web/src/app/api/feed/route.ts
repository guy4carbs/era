/**
 * The social feed page.
 *
 *   GET /api/feed?cursor=<opaque>  →  { posts: FeedPostPayload[], nextCursor, ranker }
 *
 * Auth-gated read: the feed shows other people's shared looks to a signed-in
 * viewer, so there is no anonymous access. `cursor` is the opaque keyset string
 * from the previous page's `nextCursor` (absent for page 1); a malformed cursor is
 * rejected rather than silently paging from the top.
 *
 * DORMANT behind `ERA_FEED_ENABLED`: while off the endpoint does not exist (404),
 * same posture as the Era+ routes.
 *
 * Responses:
 *   - 404 { error: 'not_found' }        feed dormant (the default today)
 *   - 401 { error: 'unauthenticated' }  no session
 *   - 400 { error: 'invalid' }          malformed cursor
 *   - 200 { posts, nextCursor, ranker }
 */
import { NextResponse } from 'next/server';

import { createDbClient } from '@era/db';

import { auth } from '../../../lib/auth.ts';
import { isFeedEnabledServer, loadFeedPage, parseCursor } from '../../../lib/feed-server.ts';
import { serverStorageClient } from '../../../lib/storage-server.ts';

const db = createDbClient(process.env.DATABASE_URL!);

export async function GET(request: Request): Promise<NextResponse> {
  if (!isFeedEnabledServer()) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }

  const session = await auth.api.getSession({ headers: request.headers });
  const userId = session?.user.id;
  if (!userId) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  }

  const cursorParam = new URL(request.url).searchParams.get('cursor');
  let cursor = null;
  if (cursorParam !== null) {
    cursor = parseCursor(cursorParam);
    if (cursor === null) {
      return NextResponse.json({ error: 'invalid' }, { status: 400 });
    }
  }

  const page = await loadFeedPage(db, serverStorageClient(), userId, cursor);
  return NextResponse.json(page);
}
