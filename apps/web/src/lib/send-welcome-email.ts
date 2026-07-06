/**
 * The welcome email — sent on a new user's first sign-in.
 *
 * Rendering (`renderWelcomeEmail`) and sending (`sendWelcomeEmail`) are split so
 * the copy is snapshot-testable without a network, exactly like the price-drop
 * email. Sending routes through the shared `sendEmail` transport
 * (`lib/send-email.ts`), so it inherits the same dormant-credential gate — no
 * real `RESEND_API_KEY` means a no-op in dev (one greppable line) and a loud
 * failure in prod.
 *
 * Before it sends, it checks the suppression list (`lib/email-suppression.ts`):
 * a hard-bounced or complained address is skipped, with a class-only log (never
 * the address, per the repo's Security posture). Copy comes from
 * `strings.emails.welcome` in `@era/core`.
 */
import { strings } from '@era/core/strings';
import { type DbClient } from '@era/db';

import { isEmailSuppressed } from './email-suppression.ts';
import { sendEmail, type SendEmailDeps } from './send-email.ts';

/** Everything the welcome send needs: the recipient, the app link, and the db. */
export interface WelcomeEmail {
  readonly to: string;
  /** The link the CTA opens — the app's entry point for this user. */
  readonly url: string;
  readonly db: DbClient;
}

/**
 * Render the welcome email — warm, brief, one clear next step, in Era's voice.
 * Pure: no env, no network, so the copy is snapshot-testable in isolation. The
 * greeting is neutral ("there") since the first-sign-in send carries no name.
 */
export function renderWelcomeEmail({ url }: { url: string }): { subject: string; html: string; text: string } {
  const copy = strings.emails.welcome;
  const subject = copy.subject;
  const body = copy.body('there');

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
                ${body}
              </td>
            </tr>
            <tr>
              <td style="padding-bottom:28px;">
                <a href="${url}" style="display:inline-block;background:#1c1b1a;color:#faf9f7;text-decoration:none;font-size:15px;font-weight:500;padding:13px 28px;border-radius:10px;">${copy.cta}</a>
              </td>
            </tr>
            <tr>
              <td style="font-size:13px;line-height:1.6;color:#9a9691;border-top:1px solid #ecebe8;padding-top:20px;">
                Take your time — Era's here whenever you're ready to start.
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  const text = [body, '', `${copy.cta}: ${url}`, '', '— Era'].join('\n');

  return { subject, html, text };
}

/**
 * Send the welcome email. Checks the suppression list first — a suppressed
 * recipient is skipped with a class-only log and no send. Otherwise it routes
 * through the shared transport, dormant on `RESEND_API_KEY` like every other Era
 * email.
 */
export async function sendWelcomeEmail(
  { to, url, db }: WelcomeEmail,
  deps: SendEmailDeps = {},
): Promise<void> {
  if (await isEmailSuppressed(db, to)) {
    (deps.log ?? console.log)('[era-email] skipped welcome email — recipient suppressed');
    return;
  }
  const { subject, html, text } = renderWelcomeEmail({ url });
  await sendEmail({ to, subject, html, text }, deps);
}
