'use client';

import { useEffect, useRef } from 'react';
import { analytics } from '../../lib/analytics';
import { useSession } from '../../lib/auth-client';

/**
 * Binds analytics identity to the auth session. When a user id appears it calls
 * `analytics.identify(userId)` so subsequent funnel events attribute to them;
 * when the session clears (sign-out) it calls `analytics.reset()`. Renders
 * nothing. Mounted inside the signed-in tab shell.
 */
export function AnalyticsIdentity() {
  const { data: session } = useSession();
  const userId = session?.user?.id ?? null;
  // Track the last identity we sent so we only call identify/reset on change.
  const lastRef = useRef<string | null>(null);

  useEffect(() => {
    if (userId === lastRef.current) return;
    if (userId) {
      analytics.identify(userId);
    } else if (lastRef.current) {
      // Went from signed-in to signed-out — drop the identity.
      analytics.reset();
    }
    lastRef.current = userId;
  }, [userId]);

  return null;
}
