/**
 * The magic-link confirm interstitial — shared validation for the one
 * load-bearing security check.
 *
 * WHY this exists: the passwordless email cannot link straight at Better Auth's
 * GET verify endpoint. Gmail (and other clients) PRE-FETCH links to scan them,
 * and that prefetch consumes the single-use token before the human ever clicks —
 * so the real sign-in fails. The fix is an interstitial `/sign-in/confirm` page
 * whose only path to the verify endpoint is a human-driven POST (a GET prefetch
 * renders the button but never submits it). See `sign-in/confirm/page.tsx` and
 * `api/auth/confirm-signin/route.ts`.
 *
 * The interstitial forwards the human to a `next` URL carried in the email. That
 * `next` is attacker-influenceable in principle (it rides in a query string), so
 * BOTH the page and the POST route MUST run it through `validateMagicLinkNext`
 * before rendering a button or issuing a redirect. This closes the open-redirect:
 * we only ever forward to the exact Better Auth verify path on our own origin.
 */

/** The one path `next` is allowed to point at — Better Auth's magic-link verify. */
export const MAGIC_LINK_VERIFY_PATH = '/api/auth/magic-link/verify';

/**
 * Validate the `next` URL the confirm flow is about to forward to.
 *
 * Accepts ONLY an absolute URL that is (a) same-origin as `expectedOrigin` and
 * (b) whose path is EXACTLY the Better Auth magic-link verify path. Anything
 * else — a foreign origin, a different path, a relative/garbage/missing value —
 * returns `null`. Returning `null` is the reject signal: callers render an error
 * (page) or 400 (route) and never redirect.
 *
 * @param next The candidate URL (raw query-string value; may be absent).
 * @param expectedOrigin Our own origin, e.g. `new URL(siteUrl()).origin`.
 * @returns The normalized, safe-to-redirect URL string, or `null` if invalid.
 */
export function validateMagicLinkNext(
  next: string | null | undefined,
  expectedOrigin: string,
): string | null {
  if (!next) {
    return null;
  }

  let parsed: URL;
  try {
    // A relative or malformed value throws here (no base) → rejected below.
    parsed = new URL(next);
  } catch {
    return null;
  }

  // Same-origin only — the core open-redirect guard.
  if (parsed.origin !== expectedOrigin) {
    return null;
  }

  // Exact verify path only — no other endpoint may be reached via the confirm flow.
  if (parsed.pathname !== MAGIC_LINK_VERIFY_PATH) {
    return null;
  }

  return parsed.toString();
}
