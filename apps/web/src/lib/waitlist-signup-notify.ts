/**
 * Post-signup side effects for the public waitlist — the confirmation email and
 * the Resend Audience add.
 *
 * Both are BEST-EFFORT and gated on a genuinely NEW signup: a duplicate join
 * (someone re-submitting the form) already got its email and audience entry on
 * the first pass, so re-sending would be spam and re-adding is pointless. The
 * `alreadyJoined` flag from `joinWaitlist` is the gate.
 *
 * Neither effect may ever fail the waitlist submit. The audience helper already
 * never throws; the email send can (a live Resend error), so it is wrapped and
 * swallowed by class only — the route returns success to the user regardless.
 *
 * Server-only: routes the send through the shared transport (dormant until
 * `RESEND_API_KEY`) and the audience helper (dormant until key + audience id).
 */
import { type DbClient } from '@era/db';

import { addContactToAudience, type AudienceContact, type AudienceDeps } from './resend-audience.ts';
import { sendWaitlistEmail, type WaitlistEmail } from './send-waitlist-email.ts';
import { type SendEmailDeps } from './send-email.ts';

/** The signup this notifies about: recipient, whether it was a duplicate, db. */
export interface WaitlistSignupArgs {
  readonly email: string;
  /** True when `joinWaitlist` found the email already on the list. */
  readonly alreadyJoined: boolean;
  readonly db: DbClient;
}

/** Injectable seams for {@link notifyNewWaitlistSignup}. All default to real. */
export interface WaitlistSignupDeps {
  readonly sendEmail?: (email: WaitlistEmail, sendDeps?: SendEmailDeps) => Promise<void>;
  readonly addContact?: (contact: AudienceContact, audienceDeps?: AudienceDeps) => Promise<void>;
  readonly log?: (message: string) => void;
}

/**
 * Fire the waitlist confirmation email and audience add for a NEW signup only.
 * A no-op for a duplicate. Best-effort: never throws, so the route can await it
 * and still return success even when a send fails.
 */
export async function notifyNewWaitlistSignup(
  { email, alreadyJoined, db }: WaitlistSignupArgs,
  deps: WaitlistSignupDeps = {},
): Promise<void> {
  if (alreadyJoined) {
    return; // duplicate: already emailed + added on the first join.
  }
  const log = deps.log ?? ((message: string): void => console.error(message));

  const send = deps.sendEmail ?? sendWaitlistEmail;
  try {
    await send({ to: email, db });
  } catch (error) {
    log(`[era-waitlist] confirmation email failed (${error instanceof Error ? error.name : 'unknown'})`);
  }

  // The audience helper never throws, but keep it isolated so an email failure
  // above never skips it and a future change here can't fail the submit.
  const addContact = deps.addContact ?? addContactToAudience;
  try {
    await addContact({ email });
  } catch (error) {
    log(`[era-waitlist] audience add failed (${error instanceof Error ? error.name : 'unknown'})`);
  }
}
