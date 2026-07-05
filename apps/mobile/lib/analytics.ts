/**
 * Mobile analytics — the one funnel surface every mobile screen tracks against.
 *
 * Codes to `@era/core`'s SDK-agnostic {@link Analytics} contract so the backing
 * vendor stays swappable and nothing outside this file knows which one is behind
 * it. The instance is DORMANT by default:
 *
 *   - `EXPO_PUBLIC_POSTHOG_KEY` set → a real PostHog React Native adapter, keyed
 *     to `EXPO_PUBLIC_POSTHOG_HOST` (defaults to PostHog EU).
 *   - unset (today) → {@link createDebugAnalytics}, which console-logs every event
 *     and exposes `getEvents()` so the funnel is VERIFIABLE with no live backend.
 *
 * Tracking is fire-and-forget and NEVER throws — the PostHog adapter swallows its
 * own failures, mirroring the debug/noop implementations, so a broken tracker can
 * never take down a render.
 */
import type { Analytics, AnalyticsProps, FunnelEvent } from '@era/core/analytics';
import { createDebugAnalytics } from '@era/core/analytics';
import AsyncStorage from '@react-native-async-storage/async-storage';
import PostHog from 'posthog-react-native';

/** Default ingestion host when only a key is provided — PostHog EU cloud. */
const DEFAULT_POSTHOG_HOST = 'https://eu.i.posthog.com';

/** Wrap a live PostHog client in the swappable {@link Analytics} surface. */
function createPostHogAnalytics(key: string, host: string): Analytics {
  const client = new PostHog(key, { host });
  return {
    track(event, props) {
      try {
        client.capture(event, props);
      } catch {
        // Fire-and-forget: a broken tracker must never surface to the caller.
      }
    },
    identify(distinctId, props) {
      try {
        client.identify(distinctId, props);
      } catch {
        // See above.
      }
    },
    reset() {
      try {
        client.reset();
      } catch {
        // See above.
      }
    },
  };
}

/**
 * Construct the singleton. Real PostHog only when a key is present; otherwise the
 * debug sink, which is what makes the funnel provable in the current build.
 */
function createAnalytics(): Analytics {
  const key = process.env.EXPO_PUBLIC_POSTHOG_KEY;
  if (key) {
    return createPostHogAnalytics(key, process.env.EXPO_PUBLIC_POSTHOG_HOST ?? DEFAULT_POSTHOG_HOST);
  }
  return createDebugAnalytics();
}

/** The one analytics instance every mobile screen imports. */
export const analytics: Analytics = createAnalytics();

/** Whether the live PostHog adapter is active (vs the dormant debug sink). */
export const analyticsActive = Boolean(process.env.EXPO_PUBLIC_POSTHOG_KEY);

/**
 * Fire a funnel event AT MOST ONCE per install, keyed by event name in
 * AsyncStorage. Used for the "first" activation moments (`first_item_added`,
 * `first_outfit_saved`) so a repeat action doesn't re-fire them. Best-effort and
 * never throws: if the flag can't be read the event still fires (better a
 * possible duplicate than a silently-dropped activation signal).
 */
export async function trackOnce(event: FunnelEvent, props?: AnalyticsProps): Promise<void> {
  const flagKey = `era.funnel.once.${event}`;
  try {
    const seen = await AsyncStorage.getItem(flagKey);
    if (seen) return;
    analytics.track(event, props);
    await AsyncStorage.setItem(flagKey, '1');
  } catch {
    // Storage unavailable — fire the event anyway; identity/dedupe is best-effort.
    analytics.track(event, props);
  }
}
