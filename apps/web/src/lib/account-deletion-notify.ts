/**
 * Post-deletion side effects — the deletion-confirmation email and the Resend
 * Audience removal.
 *
 * These run AFTER the account is already gone, using the `sessionEmail` captured
 * before the user row was deleted (the email-keyed row is gone from `user`, but
 * the address is still needed to confirm and to unsubscribe). Both are
 * BEST-EFFORT: a successful, irreversible deletion must NEVER be turned into an
 * error by a failed email or audience call, so each is wrapped and swallowed by
 * class only. The route returns `deleted: true` regardless.
 *
 * Note the asymmetry with `email_suppressions`: that table is email-keyed and
 * intentionally NOT cascade-deleted, so a deleted user's bounce record persists.
 * We remove the marketing-audience contact here, but never the suppression.
 *
 * Server-only: the deletion send routes through the shared transport (dormant
 * until `RESEND_API_KEY`) and the audience removal is dormant until key +
 * audience id are provisioned.
 */
import { type DbClient } from '@era/db';

import { removeContactFromAudience, type AudienceContactRef, type AudienceDeps } from './resend-audience.ts';
import { sendDeletionEmail, type DeletionEmail } from './send-deletion-email.ts';
import { type SendEmailDeps } from './send-email.ts';

/** The deletion this notifies about: the captured session email + the db. */
export interface AccountDeletionArgs {
  /** The session's email, captured BEFORE the user row was deleted. */
  readonly email: string;
  readonly db: DbClient;
}

/** Injectable seams for {@link notifyAccountDeleted}. All default to real. */
export interface AccountDeletionDeps {
  readonly sendEmail?: (email: DeletionEmail, sendDeps?: SendEmailDeps) => Promise<void>;
  readonly removeContact?: (contact: AudienceContactRef, audienceDeps?: AudienceDeps) => Promise<void>;
  readonly log?: (message: string) => void;
}

/**
 * Fire the deletion confirmation email and audience removal. Best-effort: never
 * throws, so the route can await it without risking the deletion's success. A
 * no-op when no email was captured (nothing to confirm or unsubscribe).
 */
export async function notifyAccountDeleted(
  { email, db }: AccountDeletionArgs,
  deps: AccountDeletionDeps = {},
): Promise<void> {
  if (!email) {
    return; // no captured address — nothing to send or remove.
  }
  const log = deps.log ?? ((message: string): void => console.error(message));

  const send = deps.sendEmail ?? sendDeletionEmail;
  try {
    await send({ to: email, db });
  } catch (error) {
    log(`[era-delete] confirmation email failed (${error instanceof Error ? error.name : 'unknown'})`);
  }

  const removeContact = deps.removeContact ?? removeContactFromAudience;
  try {
    await removeContact({ email });
  } catch (error) {
    log(`[era-delete] audience removal failed (${error instanceof Error ? error.name : 'unknown'})`);
  }
}
