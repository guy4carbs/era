/**
 * Magic-link deep-link capture — the missing half of the mobile sign-in flow.
 *
 * How native magic-link auth works here: the app requests the email with
 * `callbackURL: 'era://'`; the user taps the link in their MAIL app; Safari hits
 * `/api/auth/magic-link/verify`, which consumes the token and — because the
 * redirect target is a non-http origin — appends the session as
 * `era://?cookie=<set-cookie>` (the @better-auth/expo SERVER plugin does this).
 * iOS then opens the app with that URL.
 *
 * The gap (verified in @better-auth/expo 1.6.23 source): the CLIENT plugin only
 * captures `?cookie=` inside `openAuthSessionAsync` — the social-OAuth path. No
 * listener exists for an incoming deep link, so a magic-link cookie arrived and
 * evaporated, leaving the user on the sign-in screen. This module is that
 * listener. It stores the cookie EXACTLY the way the plugin does — same
 * SecureStore key (`era_cookie`), same JSON shape via better-auth's own
 * `parseSetCookieHeader` — so the plugin's fetch layer picks the session up as
 * if it had written it itself.
 *
 * Pure pieces (`cookieParamFromUrl`, `mergeSetCookie`) are exported for the
 * node test runner; the storage/notify side is dependency-injected.
 */
import { parseSetCookieHeader } from 'better-auth/cookies';

/** The SecureStore key the expo client plugin reads (`${storagePrefix}_cookie`). */
export const AUTH_COOKIE_STORAGE_KEY = 'era_cookie';

/**
 * Extract the `cookie` payload from an incoming deep link, or null when the URL
 * isn't ours / carries none. Only the app's own schemes are honored — `era:` in
 * real builds and `exp:`/`exps:` inside Expo Go (whose deep links are
 * exp://<host>:<port>). Web URLs and foreign schemes are ignored: never treat
 * arbitrary links as session-bearing.
 */
export function cookieParamFromUrl(url: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'era:' && parsed.protocol !== 'exp:' && parsed.protocol !== 'exps:') {
    return null;
  }
  const cookie = parsed.searchParams.get('cookie');
  return cookie !== null && cookie.length > 0 ? cookie : null;
}

/**
 * Merge a raw Set-Cookie header into the plugin's stored-cookie JSON — a
 * faithful port of @better-auth/expo's internal `getSetCookie` (same pruning of
 * max-age<=0 and already-expired entries, same `{value, expires}` shape), using
 * better-auth's own public `parseSetCookieHeader` so the formats can't drift.
 */
export function mergeSetCookie(header: string, prevJson: string | null): string {
  const parsed = parseSetCookieHeader(header);
  let merged: Record<string, { value: string; expires: string | null }> = {};
  if (prevJson) {
    try {
      merged = JSON.parse(prevJson) as typeof merged;
    } catch {
      merged = {};
    }
  }
  parsed.forEach((cookie, key) => {
    const maxAge = cookie['max-age'];
    if (maxAge !== undefined && Number(maxAge) <= 0) {
      delete merged[key];
      return;
    }
    const expires = maxAge
      ? new Date(Date.now() + Number(maxAge) * 1000)
      : cookie.expires
        ? new Date(String(cookie.expires))
        : null;
    if (expires && expires.getTime() <= Date.now()) {
      delete merged[key];
      return;
    }
    merged[key] = {
      value: cookie.value,
      expires: expires ? expires.toISOString() : null,
    };
  });
  return JSON.stringify(merged);
}

/** The storage + notify seam — SecureStore and the auth client in production. */
export interface AuthDeepLinkDeps {
  readonly getItem: (key: string) => string | null;
  readonly setItem: (key: string, value: string) => void;
  /** Poke the auth client so `useSession` re-reads (e.g. notify $sessionSignal). */
  readonly notifySession: () => void;
}

/**
 * Capture a session cookie from an incoming deep link, if it carries one.
 * Returns true when a session was stored (the caller may then route to the
 * app's signed-in surface). Safe to call with every URL the app receives.
 */
export function captureAuthSessionFromUrl(url: string, deps: AuthDeepLinkDeps): boolean {
  const cookie = cookieParamFromUrl(url);
  if (cookie === null) {
    return false;
  }
  const prev = deps.getItem(AUTH_COOKIE_STORAGE_KEY);
  deps.setItem(AUTH_COOKIE_STORAGE_KEY, mergeSetCookie(cookie, prev));
  deps.notifySession();
  return true;
}
