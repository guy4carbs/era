/**
 * Delivery of the passwordless magic-link email for Era's sign-in flow.
 *
 * This is the ONE place the magic link becomes an email. `lib/auth.ts`'s
 * `magicLink.sendMagicLink` delegates straight here; this module renders the
 * link email and hands it to the shared `sendEmail` transport
 * (`lib/send-email.ts`), which owns the Resend POST and the dormant-credential
 * activation truth-table (send / dev-log / prod-throw).
 *
 * The one behaviour this module keeps for itself is the dev-only fallback line:
 * `[era-auth] magic link for ${email}: ${url}`. Gauge's E2E reads that EXACT
 * format, so it is injected into `sendEmail` via `devLog` rather than left to
 * the transport's generic line. The magic-link URL is a secret and never
 * reaches a production log — the dev line runs in development only.
 */
import { createElement } from 'react';

import { MagicLinkEmail, renderEmail } from '@era/email';
import { strings } from '@era/core/strings';

import { isRealCredential, sendEmail } from './send-email.ts';
import { siteUrl } from './site-url.ts';

// Re-exported so existing importers (and tests) keep resolving it from here;
// the source of truth now lives in the shared transport.
export { isRealCredential };

/** The magic link to deliver, plus the recipient. */
export interface MagicLinkEmail {
  readonly email: string;
  readonly url: string;
}

/**
 * Injectable seams for testing: the env source, the `fetch` used to reach
 * Resend, and the dev-log sink. All default to the real process globals so
 * production callers pass nothing.
 */
export interface SendMagicLinkDeps {
  readonly env?: Record<string, string | undefined>;
  readonly fetchImpl?: typeof fetch;
  readonly log?: (message: string) => void;
}

/**
 * Deliver (or, in dev without a provider, log) the magic link.
 *
 * Resolves once the link has been handed off — a Resend 2xx, or the dev console
 * line. Rejects when a wired provider returns non-2xx, or in production with no
 * provider wired; Better Auth surfaces the rejection to the caller. The
 * rejection NEVER carries the url or the key.
 */
export async function sendMagicLinkEmail(
  { email, url }: MagicLinkEmail,
  deps: SendMagicLinkDeps = {},
): Promise<void> {
  // Point the email at the confirm INTERSTITIAL, never the raw verify URL.
  // Gmail-style link prefetch would otherwise trip the GET verify endpoint and
  // burn the single-use token before the human clicks. The interstitial only
  // reaches verify via a human POST — a prefetch renders the button, never
  // submits it. `url` (Better Auth's verify URL, token and all) rides along as
  // the `next` param; the confirm page + route re-validate it before use.
  const confirmUrl = `${siteUrl()}/sign-in/confirm?next=${encodeURIComponent(url)}`;
  const subject = strings.emails.magicLink.subject;
  const { html, text } = await renderEmail(createElement(MagicLinkEmail, { url: confirmUrl }));
  await sendEmail(
    { to: email, subject, html, text },
    {
      env: deps.env,
      fetchImpl: deps.fetchImpl,
      log: deps.log,
      // Preserve the exact greppable dev line the E2E depends on, byte-for-byte.
      devLog: (_message, log) => log(`[era-auth] magic link for ${email}: ${url}`),
    },
  );
}
