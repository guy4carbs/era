/**
 * The decision logic behind `POST /api/webhooks/resend`, kept free of any
 * `next/server` import so it is unit-testable under the plain node test runner
 * (mirrors how `lib/price-check.ts` holds the logic for the cron route). The
 * route handler is a thin adapter: it reads the raw body + Svix headers off the
 * Request and hands them here, then maps the returned `{ status, body }` onto a
 * `NextResponse`.
 *
 * Contract (see the route file for the full doc):
 *   - 503  RESEND_WEBHOOK_SECRET unset/placeholder — DORMANT, does no work.
 *   - 401  missing/oversized/bad signature — verified over the RAW bytes.
 *   - 200  verified: `email.bounced`/`email.complained` suppress the recipient;
 *          every other event is accepted and ignored. Always 200 on a verified
 *          event so Resend never retries a good delivery.
 *
 * Security: the secret is NEVER logged and NEVER placed in a result; the
 * recipient email is never logged — only the event type + an outcome class.
 */
import { Webhook } from 'svix';

import { createDbClient, emailSuppressions } from '@era/db';

import { isRealCredential } from './send-email.ts';

const db = createDbClient(process.env.DATABASE_URL!);

/** Cap the raw body (bytes). A Resend event is a small JSON object. */
export const MAX_WEBHOOK_BODY_BYTES = 64 * 1024;

/** The three Svix signature headers, read off the incoming request. */
export interface SvixHeaders {
  readonly 'svix-id': string;
  readonly 'svix-timestamp': string;
  readonly 'svix-signature': string;
}

/** Why an address was suppressed — the two webhook-driven reasons. */
export type SuppressionReason = 'bounced' | 'complained';

/** Everything the handler needs off the request, resolved by the route adapter. */
export interface ResendWebhookInput {
  readonly rawBody: string;
  readonly headers: SvixHeaders;
}

/** The status + JSON body the route maps onto a NextResponse. */
export interface ResendWebhookResult {
  readonly status: 503 | 401 | 200;
  readonly body: { readonly error: string } | { readonly received: true };
}

/**
 * Injectable seams for testing: the env source, the signature verifier, the
 * suppression writer, and the log sink. All default to the real implementations
 * so the route adapter passes nothing. Tests stub `verify` (no real secret) and
 * `suppress` (no live DB) to exercise the full 503/401/200 contract.
 */
export interface ResendWebhookDeps {
  readonly env?: Record<string, string | undefined>;
  readonly verify?: (secret: string, rawBody: string, headers: SvixHeaders) => unknown;
  readonly suppress?: (email: string, reason: SuppressionReason) => Promise<void>;
  readonly log?: (message: string) => void;
}

/** Default verifier: Svix over the raw payload. Throws on a bad/absent signature. */
function verifyWithSvix(secret: string, rawBody: string, headers: SvixHeaders): unknown {
  return new Webhook(secret).verify(rawBody, headers);
}

/**
 * Default suppression writer: idempotent INSERT into `email_suppressions`. The
 * email is lowercased by the caller; `onConflictDoNothing` on the unique email
 * makes a repeat bounce/complaint a no-op. Keyed by email (not user_id) so it
 * suppresses non-users (e.g. waitlist addresses) too.
 */
async function suppressInDb(email: string, reason: SuppressionReason): Promise<void> {
  await db.insert(emailSuppressions).values({ email, reason }).onConflictDoNothing({ target: emailSuppressions.email });
}

/** Pull the address off a verified Resend event payload, lowercased, or null. */
function recipientFromEvent(event: unknown): string | null {
  if (typeof event !== 'object' || event === null) {
    return null;
  }
  const data = (event as { data?: unknown }).data;
  if (typeof data !== 'object' || data === null) {
    return null;
  }
  // Resend puts the recipient(s) on `data.to` — a string or an array of strings.
  const to = (data as { to?: unknown }).to;
  const address = Array.isArray(to) ? to[0] : to;
  if (typeof address !== 'string' || address.trim() === '') {
    return null;
  }
  return address.trim().toLowerCase();
}

/** Map a Resend event type to a suppression reason, or null to accept-and-ignore. */
function reasonForType(type: unknown): SuppressionReason | null {
  if (type === 'email.bounced') {
    return 'bounced';
  }
  if (type === 'email.complained') {
    return 'complained';
  }
  return null;
}

const OK: ResendWebhookResult = { status: 200, body: { received: true } };
const UNAUTHORIZED: ResendWebhookResult = { status: 401, body: { error: 'unauthorized' } };

/** True only when the webhook has a real (non-placeholder) secret provisioned. */
export function isWebhookConfigured(env: Record<string, string | undefined>): boolean {
  return isRealCredential(env.RESEND_WEBHOOK_SECRET);
}

/**
 * Verify one Resend webhook delivery and, on a bounce/complaint, suppress the
 * recipient. Pure of `next/server`; the route adapter turns the result into a
 * response. Assumes the caller has already applied the body-size cap.
 */
export async function handleResendWebhook(
  input: ResendWebhookInput,
  deps: ResendWebhookDeps = {},
): Promise<ResendWebhookResult> {
  const env = deps.env ?? process.env;
  const log = deps.log ?? console.log;

  // Dormant until provisioned: no real secret → do no work.
  const secret = env.RESEND_WEBHOOK_SECRET;
  if (!isRealCredential(secret)) {
    return { status: 503, body: { error: 'webhook not configured' } };
  }

  // A missing/empty or over-cap body can't carry a valid signature → 401.
  if (input.rawBody.length === 0 || input.rawBody.length > MAX_WEBHOOK_BODY_BYTES) {
    return UNAUTHORIZED;
  }

  // Verify the signature over the RAW bytes. Any failure (missing header, bad
  // signature) throws; treat all of them as 401 and do no work. Never echo the
  // error — it could carry header material — and never log the secret.
  let event: unknown;
  try {
    const verify = deps.verify ?? verifyWithSvix;
    event = verify(secret, input.rawBody, input.headers);
  } catch {
    return UNAUTHORIZED;
  }

  const type = (event as { type?: unknown } | null)?.type;
  const reason = reasonForType(type);
  if (reason === null) {
    // Verified but not a suppression event (delivered/opened/…): accept + ignore.
    log(`[era-webhook] resend event ${typeof type === 'string' ? type : 'unknown'}: ignored`);
    return OK;
  }

  const email = recipientFromEvent(event);
  if (email === null) {
    // A suppression event with no usable recipient — accept so Resend stops
    // retrying, but there is nothing to suppress. Log the type + class only.
    log(`[era-webhook] resend event ${String(type)}: no recipient`);
    return OK;
  }

  try {
    const suppress = deps.suppress ?? suppressInDb;
    await suppress(email, reason);
  } catch (error) {
    // Never leak the address. A failed write is logged by class only; we still
    // return 200 so Resend does not hammer us with retries — the address will be
    // re-suppressed on the next event or a manual sweep.
    log(
      `[era-webhook] resend event ${String(type)}: suppression write failed (${error instanceof Error ? error.name : 'unknown'})`,
    );
    return OK;
  }

  log(`[era-webhook] resend event ${String(type)}: suppressed`);
  return OK;
}
