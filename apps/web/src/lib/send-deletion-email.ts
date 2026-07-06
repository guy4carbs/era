/**
 * The account-deletion-confirmation email — sent after an account is deleted.
 *
 * Rendering (`renderDeletionEmail`) and sending (`sendDeletionEmail`) are split so
 * the copy is snapshot-testable without a network, exactly like the price-drop
 * email. Sending routes through the shared `sendEmail` transport
 * (`lib/send-email.ts`) and so inherits the dormant-credential gate — no real
 * `RESEND_API_KEY` means a no-op in dev and a loud failure in prod.
 *
 * Before it sends, it checks the suppression list (`lib/email-suppression.ts`):
 * a bounced/complained address is skipped with a class-only log (never the
 * address). Confirms the deletion is real and permanent, leaves a guilt-free door
 * open, and never tries to win the user back. Copy comes from
 * `strings.emails.deletion` in `@era/core`.
 */
import { strings } from '@era/core/strings';
import { type DbClient } from '@era/db';

import { isEmailSuppressed } from './email-suppression.ts';
import { sendEmail, type SendEmailDeps } from './send-email.ts';

/** Everything the deletion send needs: the recipient and the db. */
export interface DeletionEmail {
  readonly to: string;
  readonly db: DbClient;
}

/**
 * Render the account-deletion email — plain, final, no win-back. Pure: no env, no
 * network, so the copy is snapshot-testable in isolation.
 */
export function renderDeletionEmail(): { subject: string; html: string; text: string } {
  const copy = strings.emails.deletion;
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
              <td style="font-size:16px;line-height:1.6;padding-bottom:28px;">
                ${copy.body}
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

  const text = [copy.body, '', copy.closer, '', '— Era'].join('\n');

  return { subject, html, text };
}

/**
 * Send the account-deletion email. Checks the suppression list first — a
 * suppressed recipient is skipped with a class-only log and no send. Otherwise it
 * routes through the shared transport, dormant on `RESEND_API_KEY`.
 */
export async function sendDeletionEmail({ to, db }: DeletionEmail, deps: SendEmailDeps = {}): Promise<void> {
  if (await isEmailSuppressed(db, to)) {
    (deps.log ?? console.log)('[era-email] skipped deletion email — recipient suppressed');
    return;
  }
  const { subject, html, text } = renderDeletionEmail();
  await sendEmail({ to, subject, html, text }, deps);
}
