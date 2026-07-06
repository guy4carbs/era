/**
 * The waitlist-confirmation email — sent when someone joins the pre-launch
 * waitlist.
 *
 * Rendering (`renderWaitlistEmail`) and sending (`sendWaitlistEmail`) are split so
 * the copy is snapshot-testable without a network, exactly like the price-drop
 * email. Sending routes through the shared `sendEmail` transport
 * (`lib/send-email.ts`) and so inherits the dormant-credential gate — no real
 * `RESEND_API_KEY` means a no-op in dev and a loud failure in prod.
 *
 * Before it sends, it checks the suppression list (`lib/email-suppression.ts`):
 * a bounced/complained address is skipped with a class-only log (never the
 * address). This one has no CTA — nothing to do yet, and Era doesn't pretend
 * there is. Copy comes from `strings.emails.waitlist` in `@era/core`.
 */
import { strings } from '@era/core/strings';
import { type DbClient } from '@era/db';

import { isEmailSuppressed } from './email-suppression.ts';
import { sendEmail, type SendEmailDeps } from './send-email.ts';

/** Everything the waitlist send needs: the recipient and the db. */
export interface WaitlistEmail {
  readonly to: string;
  readonly db: DbClient;
}

/**
 * Render the waitlist-confirmation email — quiet, honest, no CTA. Pure: no env,
 * no network, so the copy is snapshot-testable in isolation.
 */
export function renderWaitlistEmail(): { subject: string; html: string; text: string } {
  const copy = strings.emails.waitlist;
  const subject = copy.subject;

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
              <td style="font-size:16px;line-height:1.6;padding-bottom:20px;">
                ${copy.body}
              </td>
            </tr>
            <tr>
              <td style="font-size:14px;line-height:1.6;color:#6b6864;padding-bottom:28px;">
                ${copy.pricingNote}
              </td>
            </tr>
            <tr>
              <td style="font-size:13px;line-height:1.6;color:#9a9691;border-top:1px solid #ecebe8;padding-top:20px;">
                ${copy.closer}
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  const text = [copy.body, '', copy.pricingNote, '', copy.closer, '', '— Era'].join('\n');

  return { subject, html, text };
}

/**
 * Send the waitlist-confirmation email. Checks the suppression list first — a
 * suppressed recipient is skipped with a class-only log and no send. Otherwise it
 * routes through the shared transport, dormant on `RESEND_API_KEY`.
 */
export async function sendWaitlistEmail({ to, db }: WaitlistEmail, deps: SendEmailDeps = {}): Promise<void> {
  if (await isEmailSuppressed(db, to)) {
    (deps.log ?? console.log)('[era-email] skipped waitlist email — recipient suppressed');
    return;
  }
  const { subject, html, text } = renderWaitlistEmail();
  await sendEmail({ to, subject, html, text }, deps);
}
