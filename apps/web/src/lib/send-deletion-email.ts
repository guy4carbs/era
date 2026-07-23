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
import { createElement } from 'react';

import { DeletionEmail as DeletionEmailTemplate, renderEmail } from '@era/email';
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
 * Render the account-deletion email — plain, final, no win-back. Renders the
 * shared `@era/email` template through `renderEmail`, so it's async; still pure
 * (no env, no network), so the copy is snapshot-testable in isolation.
 */
export async function renderDeletionEmail(): Promise<{ subject: string; html: string; text: string }> {
  const subject = strings.emails.deletion.subject;
  const { html, text } = await renderEmail(createElement(DeletionEmailTemplate));
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
  const { subject, html, text } = await renderDeletionEmail();
  await sendEmail({ to, subject, html, text }, deps);
}
