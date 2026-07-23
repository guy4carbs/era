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
import { createElement } from 'react';

import { WelcomeEmail as WelcomeEmailTemplate, renderEmail } from '@era/email';
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
 * Renders the shared `@era/email` template through `renderEmail`, so it's async;
 * still pure (no env, no network), so the copy is snapshot-testable in isolation.
 * The greeting is neutral ("there") since the first-sign-in send carries no name.
 */
export async function renderWelcomeEmail({ url }: { url: string }): Promise<{ subject: string; html: string; text: string }> {
  const subject = strings.emails.welcome.subject;
  const { html, text } = await renderEmail(createElement(WelcomeEmailTemplate, { name: 'there', appUrl: url }));
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
  const { subject, html, text } = await renderWelcomeEmail({ url });
  await sendEmail({ to, subject, html, text }, deps);
}
