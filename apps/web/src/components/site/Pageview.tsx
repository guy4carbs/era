'use client';

import { useEffect } from 'react';
import { track } from '../../lib/analytics';

/**
 * Fire-and-forget pageview beacon for the marketing landing. Renders nothing;
 * on mount it emits a single `pageview` event through the dormant analytics
 * hook (a no-op until analytics is env-enabled). Mounted from the (site) layout
 * so it only runs for anonymous visitors — logged-in users are redirected to
 * `/feed` before the client tree ever hydrates.
 */
export function Pageview() {
  useEffect(() => {
    track('pageview');
  }, []);
  return null;
}
