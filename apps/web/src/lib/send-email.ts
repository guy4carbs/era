/**
 * The one server-side email transport for Era.
 *
 * Every transactional email — the passwordless magic link, a price-drop alert,
 * anything added later — funnels through `sendEmail`. It owns the Resend POST
 * and the dormant-credential activation truth-table so no caller re-implements
 * either; a caller just renders `{ subject, html, text }` and hands it over.
 *
 * Dormant-credential pattern (mirrors `lib/auth.ts` OAuth + `lib/shop-provider.ts`):
 *   - A real, operator-supplied `RESEND_API_KEY` engages the provider and the
 *     email is delivered via Resend — in BOTH dev and prod.
 *   - No real key + production → fail loudly (the deploy is misconfigured; a
 *     placeholder must never masquerade as a wired provider).
 *   - No real key + dev → emit a single greppable console line so the app works
 *     locally with no email provider. Callers that need an exact dev line (the
 *     magic link does) inject `devLog`.
 *
 * Security posture (see the repo's Security section):
 *   - `RESEND_API_KEY` and `EMAIL_FROM` are read from the server environment
 *     ONLY; nothing here reaches a client bundle.
 *   - The API key is a secret; it is NEVER logged and NEVER placed in a thrown
 *     Error — a failed send surfaces a fixed message plus the HTTP status only.
 *     The dev-log fallback runs in development only and never in production, so
 *     an email body never lands in a production log.
 */

/** Resend's transactional send endpoint. Pinned in code — never user-derived. */
const RESEND_ENDPOINT = 'https://api.resend.com/emails';

/** Default sender when `EMAIL_FROM` is unset. A verified Era domain address. */
const DEFAULT_FROM = 'Era <hello@era.style>';

/** A fully-rendered email plus its recipient — everything a single send needs. */
export interface SendEmailMessage {
  readonly to: string;
  readonly subject: string;
  readonly html: string;
  readonly text: string;
}

/**
 * Injectable seams for testing: the env source, the `fetch` used to reach
 * Resend, and the dev-log sink. All default to the real process globals so
 * production callers pass nothing.
 *
 * `devLog` overrides the generic dev-only, no-provider line — the magic link
 * uses it to emit its exact greppable format. It receives the resolved `log`
 * sink so an injected sink still captures the line in tests.
 */
export interface SendEmailDeps {
  readonly env?: Record<string, string | undefined>;
  readonly fetchImpl?: typeof fetch;
  readonly log?: (message: string) => void;
  readonly devLog?: (message: SendEmailMessage, log: (line: string) => void) => void;
}

/**
 * True only for a real, operator-supplied Resend key. The committed
 * `.env.example` ships an obvious `change-me-…` placeholder; treating that as
 * configured would fire an authenticated request that can only fail (and, in
 * prod, hide the fact that the key was never set). Same placeholder-guard idiom
 * as `lib/auth.ts` and `lib/shop-provider.ts`.
 */
export function isRealCredential(value: string | undefined): value is string {
  if (!value) {
    return false;
  }
  return !value.startsWith('change-me');
}

/**
 * Deliver (or, in dev without a provider, log) one email.
 *
 * Resolves once the email has been handed off — a Resend 2xx, or the dev console
 * line. Rejects when a wired provider returns non-2xx, or in production with no
 * provider wired. The rejection NEVER carries the key or the email body.
 */
export async function sendEmail(message: SendEmailMessage, deps: SendEmailDeps = {}): Promise<void> {
  const env = deps.env ?? process.env;
  const apiKey = env.RESEND_API_KEY;

  if (isRealCredential(apiKey)) {
    const from = env.EMAIL_FROM?.trim() ? env.EMAIL_FROM : DEFAULT_FROM;
    const fetchImpl = deps.fetchImpl ?? globalThis.fetch;
    await deliverViaResend({ apiKey, from, message }, fetchImpl);
    return;
  }

  // No real key. In production this is a misconfiguration — fail loudly, and
  // NEVER log the body. In dev, emit one greppable line so the app works with no
  // email provider; a caller with an exact-format requirement injects devLog.
  if (env.NODE_ENV === 'production') {
    throw new Error('email provider not wired yet');
  }
  const log = deps.log ?? console.log;
  if (deps.devLog) {
    deps.devLog(message, log);
    return;
  }
  log(`[era-email] no provider wired — would send "${message.subject}" to ${message.to}`);
}

/** The fields a single Resend send needs, all resolved by the caller. */
interface ResendSend {
  readonly apiKey: string;
  readonly from: string;
  readonly message: SendEmailMessage;
}

/**
 * POST the rendered email to Resend. Throws a fixed, secret-free message on a
 * non-2xx response (status only — never the response body and never the key). A
 * network-level fetch rejection propagates as-is; it carries no Era secret.
 */
async function deliverViaResend({ apiKey, from, message }: ResendSend, fetchImpl: typeof fetch): Promise<void> {
  const response = await fetchImpl(RESEND_ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to: message.to,
      subject: message.subject,
      html: message.html,
      text: message.text,
    }),
  });

  if (!response.ok) {
    // Status is safe to surface; the body is not echoed (it cannot contain our
    // key, but the fixed message keeps the failure path uniform and leak-proof).
    throw new Error(`failed to send email (status ${response.status})`);
  }
}
