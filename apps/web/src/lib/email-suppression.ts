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
import { eq } from 'drizzle-orm';

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
 * Add (or keep) an address on the suppression list. Normalizes first, then
 * inserts with `onConflictDoNothing` so a repeat bounce/complaint for the same
 * address is idempotent — the first reason recorded wins and later duplicates are
 * silently ignored. Backs the Resend webhook and any manual suppression.
 */
export async function addSuppression(db: DbClient, email: string, reason: SuppressionReason): Promise<void> {
  const normalized = normalizeEmail(email);
  await db.insert(emailSuppressions).values({ email: normalized, reason }).onConflictDoNothing();
}
