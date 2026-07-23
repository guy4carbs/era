/**
 * The email suppression list — Era's do-not-send gate.
 *
 * A hard bounce or a spam complaint (delivered by Resend's webhook) writes the
 * address here; every transactional send checks it first and skips a suppressed
 * recipient. Keyed by email, NOT user_id, so a bounced waitlist signup (who has
 * no account) is suppressed too — see the `email_suppressions` table note in
 * `@era/db`.
 *
 * Both entry points lowercase-normalize the address before touching the table:
 * the column is `unique`, and email localparts are treated case-insensitively in
 * practice, so `Foo@X.com` and `foo@x.com` must resolve to one row. The read
 * (`isEmailSuppressed`) NEVER throws — a suppression-list outage must not take
 * down the whole send path, so a lookup failure degrades to "not suppressed"
 * (fail-open on the read; the send itself still has its own guards).
 */
import { and, eq } from 'drizzle-orm';

import { type DbClient, emailSuppressions } from '@era/db';

/**
 * Why an address is suppressed. Mirrors the values the `reason` column carries
 * (`@era/db` `email_suppressions`): a Resend hard bounce, a spam complaint, or an
 * operator-added manual entry.
 */
export type SuppressionReason = 'bounced' | 'complained' | 'manual';

/** Lowercase + trim, so lookups and inserts agree on one canonical form. */
function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * True when the address is on the suppression list. Normalizes first, then does a
 * single keyed lookup. Deliberately swallows any error and returns `false`: the
 * suppression check guards a send, and a transient DB failure here must not block
 * a legitimate email — the address is treated as sendable and the failure is
 * logged (class only, never the address).
 */
export async function isEmailSuppressed(db: DbClient, email: string): Promise<boolean> {
  const normalized = normalizeEmail(email);
  try {
    const [row] = await db
      .select({ email: emailSuppressions.email })
      .from(emailSuppressions)
      .where(eq(emailSuppressions.email, normalized))
      .limit(1);
    return row !== undefined;
  } catch (error) {
    console.error(
      `[era-email] suppression lookup failed; treating as not suppressed: ${error instanceof Error ? error.name : 'unknown'}`,
    );
    return false;
  }
}

/**
 * True when the address has a `reason='manual'` suppression — i.e. the user has
 * unsubscribed themselves. This is the read behind the preferences toggle:
 * "subscribed to The Era Edit" is defined as the ABSENCE of a manual row, so a
 * bounced/complained row (a deliverability signal, not a user choice) does not
 * flip the toggle to "unsubscribed" here. NEVER throws — a lookup failure degrades
 * to `false` (treat as not-manually-unsubscribed), matching `isEmailSuppressed`'s
 * fail-open read; the class-only error is logged.
 */
export async function isManuallySuppressed(db: DbClient, email: string): Promise<boolean> {
  const normalized = normalizeEmail(email);
  try {
    const [row] = await db
      .select({ email: emailSuppressions.email })
      .from(emailSuppressions)
      .where(and(eq(emailSuppressions.email, normalized), eq(emailSuppressions.reason, 'manual')))
      .limit(1);
    return row !== undefined;
  } catch (error) {
    console.error(
      `[era-email] manual-suppression lookup failed; treating as not suppressed: ${error instanceof Error ? error.name : 'unknown'}`,
    );
    return false;
  }
}

/**
 * Add (or keep) an address on the suppression list. Normalizes first, then
 * inserts with `onConflictDoNothing` so a repeat bounce/complaint for the same
 * address is idempotent — the first reason recorded wins and later duplicates are
 * silently ignored. Backs the Resend webhook and any manual suppression.
 */
export async function addSuppression(db: DbClient, email: string, reason: SuppressionReason): Promise<void> {
  const normalized = normalizeEmail(email);
  await db.insert(emailSuppressions).values({ email: normalized, reason }).onConflictDoNothing();
}

/**
 * Remove an address's suppression — the user-reversible resubscribe. Deletes ONLY
 * a `reason='manual'` row: a manual suppression is a user's own unsubscribe (or an
 * operator entry), so it's theirs to undo by resubscribing. A `bounced` or
 * `complained` row is NEVER user-reversible — those are deliverability signals from
 * the mail system (a hard bounce means the address doesn't accept our mail; a spam
 * complaint is a legal do-not-mail), and re-sending to them would harm sender
 * reputation. So the `reason='manual'` predicate is deliberate: resubscribing a
 * complained/bounced address is a no-op, not a re-open. Normalizes first, matching
 * the lowercase form the table stores.
 */
export async function removeSuppression(db: DbClient, email: string): Promise<void> {
  const normalized = normalizeEmail(email);
  await db
    .delete(emailSuppressions)
    .where(and(eq(emailSuppressions.email, normalized), eq(emailSuppressions.reason, 'manual')));
}
