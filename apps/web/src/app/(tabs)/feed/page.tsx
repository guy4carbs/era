import { isEraFeedEnabled } from '@era/core/feed-flags';

import { FeedScreen } from './feed-client';

/**
 * `/feed` — thin SERVER wrapper whose only job is reading the authoritative
 * `ERA_FEED_ENABLED` flag at REQUEST time and handing it to the client screen.
 *
 * Why this exists: the client body originally read
 * `process.env.NEXT_PUBLIC_ERA_FEED_ENABLED`, which Next inlines into the
 * bundle at BUILD time — so flipping the flag on Railway (an env-only change
 * that redeploys the old image) silently did nothing. Server-side `process.env`
 * is read per request instead, which makes the one server flag control both the
 * API routes and this UI, with no rebuild needed to flip it.
 */

/**
 * Without this, Next would prerender the wrapper once at build (the page has no
 * other dynamic API) and bake the flag — the same baked-static trap that bit
 * `/plus` and the sitemap.
 */
export const dynamic = 'force-dynamic';

export default function FeedPage() {
  return <FeedScreen feedEnabled={isEraFeedEnabled(process.env.ERA_FEED_ENABLED)} />;
}
