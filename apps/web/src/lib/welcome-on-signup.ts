/**
 * First-sign-in welcome orchestration — the idempotent, best-effort glue between
 * Better Auth's `user.create.after` hook and the welcome email.
 *
 * The auth hook provisions the `profiles` row, then calls this. Two invariants
 * shape the design:
 *
 *   - NEVER send twice. Idempotency is enforced at the database, not in memory:
 *     we CLAIM the send with a single conditional UPDATE
 *     (`SET welcome_email_sent_at = now WHERE user_id = ? AND welcome_email_sent_at IS NULL`)
 *     and only send when that update actually claimed the row. If the column is
 *     already stamped (a re-run, a race), the update touches zero rows and we
 *     return without sending. This is the same reliability-first bias as the
 *     price-check engine: better to drop a welcome than to double-send one.
 *   - NEVER block or fail sign-in. The whole body is wrapped so any DB or send
 *     error is swallowed and logged by class only (never the email) — exactly
 *     like the profile-provisioning it sits beside in `auth.ts`.
 *
 * Server-only: it reads no client-safe surface and routes the send through the
 * shared transport, which stays dormant until `RESEND_API_KEY` is provisioned.
 */
import { and, eq, isNull } from 'drizzle-orm';

import { type DbClient, profiles } from '@era/db';

import { sendWelcomeEmail, type WelcomeEmail } from './send-welcome-email.ts';
import { type SendEmailDeps } from './send-email.ts';

/** Everything the welcome-on-signup flow needs, resolved by the auth hook. */
export interface WelcomeOnSignupArgs {
  /** The freshly-created user's id (the `profiles` primary key). */
  readonly userId: string;
  /** The user's email, from the hook payload. */
  readonly email: string;
  /** The link the welcome CTA opens — the app's entry point. */
  readonly url: string;
  readonly db: DbClient;
}

/** Injectable seams for {@link sendWelcomeEmailOnSignup}. All default to real. */
export interface WelcomeOnSignupDeps {
  /** The welcome sender. Defaults to {@link sendWelcomeEmail}. */
  readonly send?: (email: WelcomeEmail, sendDeps?: SendEmailDeps) => Promise<void>;
  /** Clock for the claim stamp. Defaults to `new Date()`. */
  readonly now?: () => Date;
  readonly log?: (message: string) => void;
}

/**
 * Claim-then-send the welcome email exactly once for a new user. Best-effort:
 * never throws, so it can be awaited from the auth hook without risking sign-in.
 * Returns without sending when the welcome has already been claimed.
 */
export async function sendWelcomeEmailOnSignup(
  { userId, email, url, db }: WelcomeOnSignupArgs,
  deps: WelcomeOnSignupDeps = {},
): Promise<void> {
  const log = deps.log ?? ((message: string): void => console.error(message));
  try {
    // Atomic claim: stamp only if not already stamped. A returned row means WE
    // won the claim and own the send; zero rows means it was already sent.
    const claimed = await db
      .update(profiles)
      .set({ welcomeEmailSentAt: (deps.now ?? ((): Date => new Date()))() })
      .where(and(eq(profiles.userId, userId), isNull(profiles.welcomeEmailSentAt)))
      .returning({ userId: profiles.userId });

    if (claimed.length === 0) {
      return; // already welcomed (or being welcomed) — never send twice.
    }

    const send = deps.send ?? sendWelcomeEmail;
    await send({ to: email, url, db });
  } catch (error) {
    // Never block sign-in on a welcome; never log the address.
    log(`[era-auth] welcome email failed for user ${userId}: ${error instanceof Error ? error.name : 'unknown'}`);
  }
}
