/**
 * Server-only Expo push delivery for Era's price-drop alerts.
 *
 * A thin wrapper over Expo's public Push API (`POST https://exp.host/--/api/v2/
 * push/send`) — no SDK, no new dependency, just `fetch`. It is DORMANT by
 * construction: with no registered device tokens for a user (the common case
 * until the mobile app ships push registration) the call is a no-op that never
 * touches the network. Like every other external call in the app (`weather.ts`,
 * `shop-provider.ts`) it is graceful — a non-2xx or a transport error is logged
 * without the token or any PII and NEVER thrown into the caller, so one failed
 * push can never fail a price-check run.
 *
 * Never import this from a client bundle — it is server-only.
 */

/** Expo's push send endpoint. Pinned in code — never user-derived. */
const EXPO_PUSH_ENDPOINT = 'https://exp.host/--/api/v2/push/send';

/** Wall timeout so a slow Expo never stalls a price-check batch. */
const EXPO_PUSH_TIMEOUT_MS = 8_000;

/** The rendered push a single send delivers to one or more device tokens. */
export interface ExpoPushMessage {
  readonly title: string;
  readonly body: string;
  /** Opaque data the app reads on tap (e.g. `{ kind, savedProductId }`). No PII. */
  readonly data?: Record<string, unknown>;
}

/** Injectable seams for testing. Both default to the real globals in production. */
export interface ExpoPushDeps {
  readonly fetchImpl?: typeof fetch;
  readonly log?: (message: string) => void;
}

/**
 * True for a plausible Expo push token. Expo tokens are wrapped as
 * `ExponentPushToken[...]` or `ExpoPushToken[...]`; anything else is dropped
 * before the request so a stray value never reaches Expo.
 */
function isExpoToken(token: string): boolean {
  return /^Expo(nent)?PushToken\[[^\]]+\]$/.test(token);
}

/**
 * Send one message to every valid token. DORMANT: with no tokens (or none that
 * look like Expo tokens) it returns immediately WITHOUT calling `fetch`. On any
 * failure — non-2xx, timeout, transport, bad body — it logs a token-free,
 * PII-free line and resolves; it never throws.
 */
export async function sendExpoPush(
  tokens: readonly string[],
  message: ExpoPushMessage,
  deps: ExpoPushDeps = {},
): Promise<void> {
  const log = deps.log ?? console.warn;
  const recipients = tokens.filter(isExpoToken);
  if (recipients.length === 0) {
    // No devices registered → dormant no-op, no network call.
    return;
  }

  const fetchImpl = deps.fetchImpl ?? globalThis.fetch;
  const payload = recipients.map((to) => ({
    to,
    title: message.title,
    body: message.body,
    ...(message.data ? { data: message.data } : {}),
  }));

  try {
    const response = await fetchImpl(EXPO_PUSH_ENDPOINT, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(EXPO_PUSH_TIMEOUT_MS),
    });
    if (!response.ok) {
      // Count only — never the token or the response body (which can echo tokens).
      log(`[expo-push] send returned status ${response.status} for ${recipients.length} token(s)`);
    }
    response.body?.cancel().catch(() => {});
  } catch (error) {
    // No token, no PII — just the failure class.
    const reason = error instanceof Error ? error.name : 'unknown';
    log(`[expo-push] send failed (${reason}) for ${recipients.length} token(s)`);
  }
}
