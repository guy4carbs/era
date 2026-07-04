/**
 * Dormant, analytics-ready event hook.
 *
 * `track` is a no-op unless `NEXT_PUBLIC_ANALYTICS_ENABLED === 'true'` AND a
 * `NEXT_PUBLIC_ANALYTICS_URL` is configured. When enabled in the browser it best-
 * effort ships the event via `navigator.sendBeacon` (falling back to a keepalive
 * `fetch`). Only client-safe `NEXT_PUBLIC_*` config is read here — no secrets —
 * and only the event name plus whatever props the caller passes are sent, so it
 * carries no PII of its own. Server-side (no `window`) it does nothing.
 */

/** Values a caller may attach to an event. */
export type AnalyticsProps = Record<string, string | number | boolean>;

function analyticsEndpoint(): string | null {
  if (process.env.NEXT_PUBLIC_ANALYTICS_ENABLED !== 'true') return null;
  const url = process.env.NEXT_PUBLIC_ANALYTICS_URL;
  return url && url.length > 0 ? url : null;
}

/**
 * Record an analytics event. Safe to call from anywhere: no-ops on the server,
 * when analytics is disabled, or if the beacon/fetch transport is unavailable.
 * Never throws — a failed send must not break the caller.
 */
export function track(event: string, props?: AnalyticsProps): void {
  if (typeof window === 'undefined') return;

  const endpoint = analyticsEndpoint();
  if (!endpoint) return;

  const payload = JSON.stringify({ event, props: props ?? {}, ts: Date.now() });

  try {
    if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
      navigator.sendBeacon(endpoint, new Blob([payload], { type: 'application/json' }));
      return;
    }
    void fetch(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: payload,
      keepalive: true,
    }).catch(() => undefined);
  } catch {
    // Analytics is best-effort — swallow transport errors.
  }
}
