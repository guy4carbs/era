/**
 * The unsubscribe route's testable core — verify a signed link, suppress the
 * address, best-effort drop it from the Resend audience, and say where to redirect.
 *
 * Split out of the route handler (like `resend-webhook.ts`) so the whole contract
 * is unit-testable without Next's request plumbing: the DB write, the audience
 * call, and the token check are all injectable. The route is a thin adapter that
 * reads `email`/`token` off the query string and maps the result to a response.
 *
 * A valid one-click link → the address is suppressed with reason 'manual' (a
 * user-reversible unsubscribe) and, best-effort, removed from the marketing
 * audience, then we 303 to the calm `/email/unsubscribed` page. An invalid or
 * missing token → 400 with a plain message; we do NOT reveal whether the address
 * exists, and we never suppress on an unverified request (or anyone holding a link
 * shape could suppress an arbitrary address).
 */
import { verifyEmailLinkToken, type EmailLinkDeps } from './email-links.ts';

/** Where a successful unsubscribe lands. */
export const UNSUBSCRIBED_PATH = '/email/unsubscribed';

/** The result of handling an unsubscribe request — the route maps this to a response. */
export type UnsubscribeResult =
  | { readonly kind: 'redirect'; readonly path: string }
  | { readonly kind: 'invalid'; readonly status: 400 };

/**
 * Injectable seams: the suppression write, the best-effort audience removal, the
 * token verifier (defaults to the real HMAC check), and the env the verifier
 * reads. Tests pass fakes; the route passes the real DB-bound closures.
 */
export interface UnsubscribeDeps {
  readonly suppress: (email: string) => Promise<void>;
  readonly removeFromAudience?: (email: string) => Promise<void>;
  readonly verify?: (email: string, token: string) => boolean;
  readonly env?: EmailLinkDeps['env'];
}

/**
 * Handle a one-click unsubscribe. `email` and `token` come straight off the query
 * string (either may be null when absent). Returns a redirect on success or an
 * `invalid` 400 on a bad/missing token — and only performs side effects on a
 * verified request.
 */
export async function handleUnsubscribe(
  email: string | null,
  token: string | null,
  deps: UnsubscribeDeps,
): Promise<UnsubscribeResult> {
  if (!email || !token) {
    return { kind: 'invalid', status: 400 };
  }

  const verify = deps.verify ?? ((e, t) => verifyEmailLinkToken(e, t, { env: deps.env }));
  if (!verify(email, token)) {
    return { kind: 'invalid', status: 400 };
  }

  // Verified: record the manual (reversible) suppression. This is the load-bearing
  // write, so a failure here propagates (the caller returns a 500) rather than
  // pretending the unsubscribe succeeded.
  await deps.suppress(email);

  // Best-effort audience cleanup — never load-bearing. A failure must not fail the
  // unsubscribe; the audience helper already swallows its own errors, but we guard
  // anyway in case a different remover is injected.
  if (deps.removeFromAudience) {
    try {
      await deps.removeFromAudience(email);
    } catch {
      // Swallow — the suppression above is what actually stops the mail.
    }
  }

  return { kind: 'redirect', path: UNSUBSCRIBED_PATH };
}
