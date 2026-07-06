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
import { isRealCredential, sendEmail } from './send-email.ts';

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
  const { subject, html, text } = renderEmail(url);
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

/** Era's magic-link email — warm, understated, one clear action. */
function renderEmail(url: string): { subject: string; html: string; text: string } {
  const subject = 'Your sign-in link for Era';

  const html = `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#faf9f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#1c1b1a;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#faf9f7;">
      <tr>
        <td align="center" style="padding:48px 24px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:440px;">
            <tr>
              <td style="font-size:20px;font-weight:600;letter-spacing:0.02em;padding-bottom:24px;">Era</td>
            </tr>
            <tr>
              <td style="font-size:16px;line-height:1.6;padding-bottom:28px;">
                Welcome back. Tap the button below to sign in — the link expires shortly and can only be used once.
              </td>
            </tr>
            <tr>
              <td style="padding-bottom:28px;">
                <a href="${url}" style="display:inline-block;background:#1c1b1a;color:#faf9f7;text-decoration:none;font-size:15px;font-weight:500;padding:13px 28px;border-radius:10px;">Sign in to Era</a>
              </td>
            </tr>
            <tr>
              <td style="font-size:13px;line-height:1.6;color:#6b6864;padding-bottom:8px;">
                Or paste this link into your browser:
              </td>
            </tr>
            <tr>
              <td style="font-size:13px;line-height:1.6;color:#6b6864;word-break:break-all;padding-bottom:28px;">
                <a href="${url}" style="color:#6b6864;">${url}</a>
              </td>
            </tr>
            <tr>
              <td style="font-size:13px;line-height:1.6;color:#9a9691;border-top:1px solid #ecebe8;padding-top:20px;">
                If you didn't ask to sign in, you can safely ignore this email — nothing will happen.
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  const text = [
    'Welcome back to Era.',
    '',
    'Tap the link below to sign in. It expires shortly and can only be used once.',
    '',
    url,
    '',
    "If you didn't ask to sign in, you can safely ignore this email.",
    '',
    '— Era',
  ].join('\n');

  return { subject, html, text };
}
