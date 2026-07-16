import { isEraTurnaroundEnabled } from '@era/core/turnaround-flags';

import { ClosetScreen } from './closet-client';

/**
 * `/closet` — thin SERVER wrapper whose only job is reading the authoritative
 * `ERA_TURNAROUND_ENABLED` flag at REQUEST time and handing it to the client
 * screen, which threads it to the item detail's angle-viewer flow.
 *
 * Why this exists: a client body reading `NEXT_PUBLIC_ERA_TURNAROUND_ENABLED`
 * would have Next inline it into the bundle at BUILD time — so flipping the flag
 * on Railway (an env-only change that redeploys the old image) silently does
 * nothing. Server-side `process.env` is read per request instead, so the one
 * server flag controls both the turnaround API routes and this UI, no rebuild
 * needed to flip it. Same pattern as the `/feed` and `/design` wrappers.
 */

/**
 * Without this, Next would prerender the wrapper once at build (the page has no
 * other dynamic API) and bake the flag — the same baked-static trap that bit
 * `/plus`, the sitemap, and `/feed`.
 */
export const dynamic = 'force-dynamic';

export default function ClosetPage() {
  return <ClosetScreen turnaroundEnabled={isEraTurnaroundEnabled(process.env.ERA_TURNAROUND_ENABLED)} />;
}
