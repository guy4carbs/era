/**
 * Signed email links — the per-recipient unsubscribe + preferences URLs.
 *
 * The Era Edit is broadcast marketing, so its one-click unsubscribe and the
 * preferences page must be reachable WITHOUT a session (the recipient may have no
 * account at all — a waitlist joiner). We can't gate on auth, so the identifying
 * `email` in the URL is bound to an HMAC token: only Era, holding the signing
 * secret, can mint a link for an address, so no one can unsubscribe or read
 * another person's preferences by editing the query string.
 *
 * The token is `HMAC-SHA256(normalized-email)` keyed with `BETTER_AUTH_SECRET`,
 * hex-encoded. We reuse that existing server secret rather than adding another to
 * rotate. NOTE: this couples a link's validity to `BETTER_AUTH_SECRET` rotation —
 * rotating the auth secret invalidates every previously-mailed unsubscribe/prefs
 * link. That is an accepted, documented tradeoff: rotation is rare, the links are
 * low-stakes (worst case a recipient re-requests one), and a dedicated secret is
 * not worth the operational surface here.
 *
 * `verifyEmailLinkToken` compares in CONSTANT TIME (`crypto.timingSafeEqual` on
 * equal-length buffers; a length check first, since that function throws on
 * unequal lengths and the token length is not itself a secret). The secret is
 * read from the server environment ONLY and is never logged.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';

import { siteUrl } from './site-url.ts';

/**
 * Injectable env seam (mirrors `send-email.ts` / `resend-audience.ts`): defaults
 * to `process.env` so production callers pass nothing; tests pass a fixed secret.
 */
export interface EmailLinkDeps {
  readonly env?: Record<string, string | undefined>;
}

/** Lowercase + trim so a token binds to the same canonical form suppression uses. */
function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** Resolve the signing secret, or throw — a missing secret must never sign as ''. */
function signingSecret(env: Record<string, string | undefined>): string {
  const secret = env.BETTER_AUTH_SECRET;
  if (!secret || secret.trim() === '') {
    throw new Error('BETTER_AUTH_SECRET is required to sign email links');
  }
  return secret;
}

/**
 * The signed token for an address: hex `HMAC-SHA256(normalized-email)` keyed with
 * `BETTER_AUTH_SECRET`. Deterministic — the same address always mints the same
 * token (so a re-sent link matches), which is exactly what a stateless verify
 * needs.
 */
export function emailLinkToken(email: string, deps: EmailLinkDeps = {}): string {
  const secret = signingSecret(deps.env ?? process.env);
  return createHmac('sha256', secret).update(normalizeEmail(email)).digest('hex');
}

/**
 * True when `token` is the valid signature for `email`. Recomputes the expected
 * token and compares in constant time. A length mismatch (or a malformed token)
 * fails closed; this never throws on a bad token, only on a missing secret (a
 * server misconfiguration the caller should surface).
 */
export function verifyEmailLinkToken(email: string, token: string, deps: EmailLinkDeps = {}): boolean {
  const expected = emailLinkToken(email, deps);
  const provided = Buffer.from(token);
  const computed = Buffer.from(expected);
  if (provided.length !== computed.length) {
    return false;
  }
  return timingSafeEqual(provided, computed);
}

/**
 * The one-click unsubscribe URL for an address:
 * `${siteUrl()}/api/email/unsubscribe?email=…&token=…`. Both query values are
 * `encodeURIComponent`-escaped so an address with a `+`/`&` can't break the query.
 */
export function buildUnsubscribeUrl(email: string, deps: EmailLinkDeps = {}): string {
  const token = emailLinkToken(email, deps);
  const q = `email=${encodeURIComponent(email)}&token=${encodeURIComponent(token)}`;
  return `${siteUrl()}/api/email/unsubscribe?${q}`;
}

/**
 * The signed preferences-page URL for an address:
 * `${siteUrl()}/email/preferences?email=…&token=…`. Same escaping as the
 * unsubscribe link.
 */
export function buildPreferencesUrl(email: string, deps: EmailLinkDeps = {}): string {
  const token = emailLinkToken(email, deps);
  const q = `email=${encodeURIComponent(email)}&token=${encodeURIComponent(token)}`;
  return `${siteUrl()}/email/preferences?${q}`;
}
