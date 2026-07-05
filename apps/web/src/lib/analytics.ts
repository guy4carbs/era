/**
 * Web analytics client — the single surface the web app tracks through.
 *
 * It builds one {@link Analytics} singleton from Oracle's SDK-agnostic contract
 * (`@era/core/analytics`) and picks its backing adapter from env at module load:
 *
 *   - `NEXT_PUBLIC_POSTHOG_KEY` set → a real PostHog adapter. `posthog-js` is
 *     dynamically imported on first use so it never enters the marketing bundle
 *     the Lighthouse-90 landing is measured on. Calls made before the SDK loads
 *     are queued and flushed once it is ready.
 *   - otherwise → Oracle's `createDebugAnalytics()`, which console-logs every
 *     event as `[analytics] <event>` and retains them for `getEvents()`. This is
 *     the active path until keys land, so the funnel is verifiable NOW.
 *
 * Tracking is fire-and-forget and never throws (guaranteed by the contract). The
 * legacy `track(event, props)` free function is kept for existing call sites.
 */
import {
  createDebugAnalytics,
  type Analytics,
  type AnalyticsProps,
  type CapturedEvent,
  type DebugAnalytics,
  type FunnelEvent,
} from '@era/core/analytics';

export type { AnalyticsProps, FunnelEvent };

/** Default PostHog ingestion host (EU) unless overridden. */
const DEFAULT_POSTHOG_HOST = 'https://eu.i.posthog.com';

/**
 * A PostHog-backed adapter. `posthog-js` is loaded lazily on first use; until it
 * resolves, calls are buffered and replayed in order. Every method swallows its
 * own failures so tracking stays fire-and-forget.
 */
function createPostHogAnalytics(key: string, host: string): Analytics {
  type Posthog = (typeof import('posthog-js'))['default'];
  let client: Posthog | null = null;
  let loading = false;
  const queue: Array<(ph: Posthog) => void> = [];

  const ensureLoaded = () => {
    if (client || loading || typeof window === 'undefined') return;
    loading = true;
    void import('posthog-js')
      .then(({ default: posthog }) => {
        posthog.init(key, {
          api_host: host,
          person_profiles: 'identified_only',
          capture_pageview: false,
        });
        client = posthog;
        for (const fn of queue.splice(0)) {
          try {
            fn(posthog);
          } catch {
            // Fire-and-forget: a failed capture must never surface.
          }
        }
      })
      .catch(() => {
        // Could not load the SDK — drop the buffer, never throw.
        loading = false;
        queue.length = 0;
      });
  };

  const run = (fn: (ph: Posthog) => void) => {
    if (typeof window === 'undefined') return; // SSR: nothing to capture.
    if (client) {
      try {
        fn(client);
      } catch {
        // See above.
      }
      return;
    }
    queue.push(fn);
    ensureLoaded();
  };

  return {
    track(event, props) {
      run((ph) => ph.capture(event, props));
    },
    identify(distinctId, props) {
      run((ph) => ph.identify(distinctId, props));
    },
    reset() {
      run((ph) => ph.reset());
    },
  };
}

/** Construct the singleton once, choosing the adapter from env. */
function createAnalytics(): { analytics: Analytics; debug: DebugAnalytics | null } {
  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  if (key && key.length > 0) {
    const host = process.env.NEXT_PUBLIC_POSTHOG_HOST ?? DEFAULT_POSTHOG_HOST;
    return { analytics: createPostHogAnalytics(key, host), debug: null };
  }
  const debug = createDebugAnalytics();
  return { analytics: debug, debug };
}

const { analytics: analyticsSingleton, debug: debugAnalytics } = createAnalytics();

/** The web analytics singleton. Import this (or {@link track}) — never an SDK. */
export const analytics: Analytics = analyticsSingleton;

/**
 * Convenience wrapper kept for back-compat with existing call sites that import
 * `{ track }`. Delegates to the singleton.
 */
export function track(event: FunnelEvent | string, props?: AnalyticsProps): void {
  analytics.track(event, props);
}

/**
 * Fire a funnel event at most once per user per browser — the "first_*"
 * activation moments (`first_item_added`, `first_outfit_saved`) express a
 * once-per-user intent. Guarded by a `localStorage` marker keyed to the distinct
 * id; if storage is unavailable (private mode) it degrades to firing (so the
 * moment isn't lost). Best-effort and never throws.
 */
export function trackFirstOnce(
  event: FunnelEvent,
  distinctId: string | null | undefined,
  props?: AnalyticsProps,
): void {
  if (typeof window === 'undefined') return;
  const id = distinctId && distinctId.length > 0 ? distinctId : 'anon';
  const markerKey = `era:funnel:${event}:${id}`;
  try {
    if (window.localStorage.getItem(markerKey)) return;
    window.localStorage.setItem(markerKey, String(Date.now()));
  } catch {
    // No localStorage — proceed; we simply can't dedupe across sessions.
  }
  analytics.track(event, props);
}

/**
 * Captured events, for tests / E2E verification. Non-empty only on the debug
 * adapter (no keys); the PostHog path returns an empty list since events go to
 * the SDK. Gauge can also read these in-browser via `window.__eraAnalytics`.
 */
export function getCapturedEvents(): readonly CapturedEvent[] {
  return debugAnalytics ? debugAnalytics.getEvents() : [];
}

// Expose the debug sink on the client for E2E assertions when it's the active
// adapter. Never attached when a real SDK is wired.
if (typeof window !== 'undefined' && debugAnalytics) {
  (window as unknown as { __eraAnalytics?: DebugAnalytics }).__eraAnalytics = debugAnalytics;
}
