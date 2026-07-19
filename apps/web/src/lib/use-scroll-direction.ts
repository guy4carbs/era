'use client';

import { useEffect, useState } from 'react';

/** How far (px) the scroll must accumulate in one direction before we react. */
const DELTA_THRESHOLD = 12;
/** Within this many px of the page top the bar is always shown. */
const TOP_ZONE = 64;

/**
 * Track whether a bottom-anchored bar should be shown based on scroll direction:
 * hide when the user scrolls DOWN (reading forward), return when they scroll UP.
 *
 * Jitter under `DELTA_THRESHOLD` is ignored so a trackpad twitch never toggles
 * the bar, and the bar always reports "shown" near the top of the page. SSR-safe
 * — returns `true` (shown) until the browser effect runs.
 */
export function useScrollDirection(): boolean {
  const [shown, setShown] = useState(true);

  useEffect(() => {
    let lastY = window.scrollY;
    // Accumulated delta since the last direction flip; sign encodes direction.
    let accumulated = 0;

    const onScroll = () => {
      const currentY = window.scrollY;
      const delta = currentY - lastY;
      lastY = currentY;

      if (currentY < TOP_ZONE) {
        accumulated = 0;
        setShown(true);
        return;
      }

      // Reset the accumulator whenever direction flips, so a threshold is met
      // by sustained travel one way rather than net position.
      if ((delta > 0 && accumulated < 0) || (delta < 0 && accumulated > 0)) {
        accumulated = 0;
      }
      accumulated += delta;

      if (accumulated > DELTA_THRESHOLD) {
        setShown(false);
      } else if (accumulated < -DELTA_THRESHOLD) {
        setShown(true);
      }
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return shown;
}
