import { isEraFeedEnabled } from '@era/core/feed-flags';

import { DesignScreen } from './design-client';

/**
 * `/design` — thin SERVER wrapper reading the authoritative `ERA_FEED_ENABLED`
 * at REQUEST time for the share-to-feed buttons on outfit/era cards. See the
 * `/feed` wrapper for why: `NEXT_PUBLIC_*` reads in client code are inlined at
 * BUILD time, so a Railway flag flip (env-only redeploy, old image) never
 * reaches them.
 */

/** Request-time flag read — without this the wrapper prerenders and bakes it. */
export const dynamic = 'force-dynamic';

export default function DesignPage() {
  return <DesignScreen feedEnabled={isEraFeedEnabled(process.env.ERA_FEED_ENABLED)} />;
}
