/**
 * Resend Audience sync — add/remove a contact on the marketing audience.
 *
 * Waitlist signups (and later, product opt-ins) mirror into a Resend Audience so
 * broadcast email has an up-to-date contact list. This module owns the two REST
 * calls and the dormant-credential guard so callers don't re-implement either;
 * a caller just hands over `{ email, firstName? }`.
 *
 * Dormant-credential pattern (mirrors `lib/send-email.ts`):
 *   - A real `RESEND_API_KEY` AND a set `RESEND_AUDIENCE_ID` engage the sync.
 *   - Missing/placeholder key OR unset audience id → NO-OP (return silently).
 *     The waitlist must keep working with no Resend audience wired.
 *
 * Failure posture — audience sync is BEST-EFFORT and NEVER load-bearing:
 *   - These functions NEVER throw into the caller. A non-2xx response or a
 *     network error is swallowed and logged by CLASS ONLY (status / error name).
 *     A failed contact sync must never fail a waitlist signup.
 *
 * Security posture (see the repo's Security section):
 *   - `RESEND_API_KEY` / `RESEND_AUDIENCE_ID` are read from the server
 *     environment ONLY; nothing here reaches a client bundle.
 *   - The API key is a secret: it is NEVER logged and NEVER placed in a thrown
 *     Error. The recipient email is never logged either.
 */
import { isRealCredential } from './send-email.ts';

/** Resend's Audiences API base. Pinned in code — never user-derived. */
const RESEND_API_BASE = 'https://api.resend.com';

/** Abandon a sync request after this many ms — it must never block a caller. */
const REQUEST_TIMEOUT_MS = 5_000;

/** A contact to add to the audience. */
export interface AudienceContact {
  readonly email: string;
  readonly firstName?: string;
}

/** A contact to remove from the audience. */
export interface AudienceContactRef {
  readonly email: string;
}

/**
 * Injectable seams for testing: the env source and the `fetch` used to reach
 * Resend and the log sink. All default to the real process globals so production
 * callers pass nothing.
 */
export interface AudienceDeps {
  readonly env?: Record<string, string | undefined>;
  readonly fetchImpl?: typeof fetch;
  readonly log?: (message: string) => void;
}

/** Resolved config once dormancy is cleared: a real key + an audience id. */
interface AudienceConfig {
  readonly apiKey: string;
  readonly audienceId: string;
}

/** Resolve the wired config, or null when the sync is dormant (no work to do). */
function resolveConfig(env: Record<string, string | undefined>): AudienceConfig | null {
  const apiKey = env.RESEND_API_KEY;
  const audienceId = env.RESEND_AUDIENCE_ID;
  if (!isRealCredential(apiKey) || !audienceId || audienceId.trim() === '') {
    return null;
  }
  return { apiKey, audienceId: audienceId.trim() };
}

/**
 * Add (or upsert) a contact on the Resend audience. Dormant no-op without a real
 * key + audience id. Best-effort: a non-2xx or network error is logged by class
 * only and swallowed — this NEVER throws into the caller.
 */
export async function addContactToAudience(contact: AudienceContact, deps: AudienceDeps = {}): Promise<void> {
  const config = resolveConfig(deps.env ?? process.env);
  if (!config) {
    return;
  }
  await send(
    config,
    {
      method: 'POST',
      path: `/audiences/${config.audienceId}/contacts`,
      body: JSON.stringify({
        email: contact.email,
        first_name: contact.firstName,
        unsubscribed: false,
      }),
    },
    deps,
  );
}

/**
 * Remove a contact from the Resend audience by email. Dormant no-op without a
 * real key + audience id. Best-effort: NEVER throws into the caller.
 */
export async function removeContactFromAudience(contact: AudienceContactRef, deps: AudienceDeps = {}): Promise<void> {
  const config = resolveConfig(deps.env ?? process.env);
  if (!config) {
    return;
  }
  // Resend accepts the email as the contact identifier on the delete path.
  await send(
    config,
    { method: 'DELETE', path: `/audiences/${config.audienceId}/contacts/${encodeURIComponent(contact.email)}` },
    deps,
  );
}

/** One Resend audience request, already resolved by the caller. */
interface AudienceRequest {
  readonly method: 'POST' | 'DELETE';
  readonly path: string;
  readonly body?: string;
}

/**
 * Issue one authenticated Resend request under a timeout. Swallows every failure
 * (non-2xx, timeout, network) and logs it by CLASS ONLY — never the key, never
 * the email. Modeled on `lib/send-email.ts`'s Bearer fetch.
 */
async function send(config: AudienceConfig, req: AudienceRequest, deps: AudienceDeps): Promise<void> {
  const fetchImpl = deps.fetchImpl ?? globalThis.fetch;
  const log = deps.log ?? console.log;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetchImpl(`${RESEND_API_BASE}${req.path}`, {
      method: req.method,
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: req.body,
      signal: controller.signal,
    });
    if (!response.ok) {
      // Status is safe to surface; the body/key/email are not.
      log(`[era-audience] ${req.method} contact failed (status ${response.status})`);
    }
  } catch (error) {
    log(`[era-audience] ${req.method} contact errored (${error instanceof Error ? error.name : 'unknown'})`);
  } finally {
    clearTimeout(timer);
  }
}
