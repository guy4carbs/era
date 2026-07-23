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
import { createElement } from 'react';

import { WaitlistEmail as WaitlistEmailTemplate, renderEmail } from '@era/email';
import { strings } from '@era/core/strings';
import { type DbClient } from '@era/db';

import { isEmailSuppressed } from './email-suppression.ts';
import { sendEmail, type SendEmailDeps } from './send-email.ts';

/** Everything the waitlist send needs: the recipient, the db, and the place in line. */
export interface WaitlistEmail {
  readonly to: string;
  readonly db: DbClient;
  /** The joiner's 1-based place in line — rendered as the large numeral when present. */
  readonly position?: number;
}

/**
 * Render the waitlist-confirmation email — quiet, elegant, the same voice as the
 * on-site gift. Renders the shared `@era/email` template through `renderEmail`,
 * so it's async; still pure (no env, no network), so the copy is snapshot-testable
 * in isolation.
 *
 * The serif heading (the Georgia Fraunces stand-in) now lives in the `@era/email`
 * template, not this file — so the inline HTML string is gone. When `position`
 * is present, the template renders the numeral large in the serif stack with the
 * gift's `positionLabel` beneath. The one action is a quiet era.style link (never
 * a button — the email confirms, it doesn't push), and the pricing-honesty line
 * stays beneath, small.
 */
export async function renderWaitlistEmail(position?: number): Promise<{ subject: string; html: string; text: string }> {
  const subject = strings.site.gift.email.subject;
  const { html, text } = await renderEmail(createElement(WaitlistEmailTemplate, { position }));
  return { subject, html, text };
}

/**
 * Send the waitlist-confirmation email. Checks the suppression list first — a
 * suppressed recipient is skipped with a class-only log and no send. Otherwise it
 * routes through the shared transport, dormant on `RESEND_API_KEY`.
 */
export async function sendWaitlistEmail({ to, db, position }: WaitlistEmail, deps: SendEmailDeps = {}): Promise<void> {
  if (await isEmailSuppressed(db, to)) {
    (deps.log ?? console.log)('[era-email] skipped waitlist email — recipient suppressed');
    return;
  }
  const { subject, html, text } = await renderWaitlistEmail(position);
  await sendEmail({ to, subject, html, text }, deps);
}
