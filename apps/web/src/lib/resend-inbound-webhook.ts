/**
 * The decision + processing logic behind `POST /api/webhooks/resend-inbound`, kept
 * free of any `next/server` import so it is unit-testable under the plain node test
 * runner (mirrors `lib/resend-webhook.ts` for the outbound delivery webhook). The
 * route handler is a thin adapter: it reads the raw body + Svix headers off the
 * Request and hands them here, then maps the returned `{ status, body }`.
 *
 * Resend inbound is a TWO-HOP, AT-LEAST-ONCE flow:
 *   1. The `email.received` webhook is METADATA ONLY — no body. It carries
 *      `data.email_id`, `from`, `to[]`, `received_for[]`, `subject`. It is signed
 *      with the SAME Svix scheme as the outbound webhook, but with a SEPARATE
 *      secret (`RESEND_INBOUND_WEBHOOK_SECRET`) — a separate endpoint gets its own
 *      secret.
 *   2. The body is fetched on a second hop:
 *      `GET https://api.resend.com/emails/receiving/{email_id}` (Bearer
 *      `RESEND_API_KEY`) → `{ html, text, ... }`.
 *
 * Delivery is at-least-once (Resend retries 5s→10h on any non-200), so the import
 * MUST be durably idempotent. The gate is the single `inbound_email_events` insert
 * keyed by `data.email_id`:
 *
 * ATOMICITY / IDEMPOTENCY — claim-first, not a transaction. The `@era/db` client
 * is the Neon HTTP driver, which has NO interactive transactions (drizzle throws
 * "No transactions support in neon-http driver"), and the shared import core
 * persists items individually via `processItemPipeline` (shared verbatim with two
 * other routes). So true "items + event row in one txn" is not available at this
 * layer. Instead — exactly as the `inbound_email_events` schema comment prescribes
 * — we CLAIM the event row (insert, onConflictDoNothing) as the whole dedupe gate:
 *   - A pre-check skips the second hop on an already-processed replay.
 *   - We claim AFTER a successful body fetch, so a transient second-hop failure
 *     returns 500 (unclaimed) and Resend's retry redoes it cleanly.
 *   - A crash BETWEEN the claim and import completion loses that one email's drafts
 *     (the retry sees the claim and skips). That is the accepted tradeoff of
 *     claim-first: at-most-once import, never partial-duplicate drafts across
 *     retries. R2 image side-effects on a failed import are acceptable orphans.
 *
 * Privacy: the secret is NEVER logged and NEVER placed in a result; email
 * addresses, tokens, subjects, and bodies are NEVER logged or returned — only an
 * event class. The catch-all subdomain means arbitrary local-parts arrive, so the
 * no-token path is expected noise and logs a class only.
 *
 * Abuse bounds: a per-user daily-volume cap (counted off the durable
 * `inbound_email_events` ledger) limits the draft-row flood a leaked address
 * enables, and the second-hop body is byte-capped BEFORE buffering. Both reject
 * as a silent 200 no-op WITHOUT claiming the event row.
 *
 * Contract:
 *   - 503  RESEND_INBOUND_WEBHOOK_SECRET unset/placeholder — DORMANT, no work.
 *   - 401  missing/oversized/bad signature — verified over the RAW bytes.
 *   - 500  the body second-hop failed transiently — Resend retries.
 *   - 200  everything else: non-received event, no/unknown/revoked token, replay,
 *          over the daily cap, an oversized body (permanent drop), or a successful
 *          import. Always a minimal fixed-enum body.
 */
import { and, count, eq, gte } from 'drizzle-orm';
import { Webhook } from 'svix';

import { type AuthContext } from '@era/core';
import { createDbClient, inAppNotifications, inboundEmailEvents } from '@era/db';
import { strings } from '@era/core/strings';

import type { ParsedEmail } from './email-receipt.ts';
import { parseReceipt } from './receipt-parsers/index.ts';
import type { ReceiptImportOutcome } from './receipt-import-server.ts';
import { resolveToken, type TokenResolution } from './receipt-inbox.ts';
import { isRealCredential } from './send-email.ts';
import type { SvixHeaders } from './resend-webhook.ts';

const db = createDbClient(process.env.DATABASE_URL!);

/** Cap the raw webhook body (bytes). An inbound event is a small JSON object. */
export const MAX_INBOUND_WEBHOOK_BODY_BYTES = 64 * 1024;

/** The Resend endpoint that returns a received email's body (second hop). */
const RECEIVING_BODY_URL = 'https://api.resend.com/emails/receiving';
const SECOND_HOP_TIMEOUT_MS = 10_000;

/**
 * Byte cap on the fetched body (html + text + headers) BEFORE buffering. A real
 * receipt is tiny; anything past this is treated as a PERMANENT failure (drop,
 * not retry — re-fetching an oversized message never gets smaller). Checked
 * against Content-Length when present, then enforced on the stream regardless.
 */
const MAX_SECOND_HOP_BYTES = 2 * 1024 * 1024;

/**
 * Per-user daily inbound-volume cap. Spend is already bounded by the AI budget,
 * but draft-ROW count is not — anyone who learns an address could otherwise flood
 * up to {@link MAX_ITEMS_PER_RECEIPT} junk drafts per email, unbounded. 10/day is
 * generous for real forwarding yet hostile-proof. Counted from the durable
 * `inbound_email_events` ledger (processed emails), so it survives restarts.
 */
const MAX_INBOUND_PER_DAY = 10;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

/** Local-part shape of an inbound receipt address: `u_<token>` (token ≥ 24 chars). */
const TOKEN_LOCALPART_RE = /^u_([a-z0-9]{24,})$/i;

/**
 * The fetched body exceeded {@link MAX_SECOND_HOP_BYTES}. A PERMANENT condition —
 * the handler drops it (200 no-op, no claim), never a 500 retry.
 */
export class InboundBodyTooLargeError extends Error {
  constructor() {
    super('inbound body too large');
    this.name = 'InboundBodyTooLargeError';
    Object.setPrototypeOf(this, InboundBodyTooLargeError.prototype);
  }
}

/** The status + JSON body the route maps onto a NextResponse. */
export interface InboundWebhookResult {
  readonly status: 503 | 401 | 500 | 200;
  readonly body: { readonly error: string } | { readonly received: true };
}

/** Everything the handler needs off the request, resolved by the route adapter. */
export interface InboundWebhookInput {
  readonly rawBody: string;
  readonly headers: SvixHeaders;
}

/** The body pieces the second hop returns (metadata comes from the event). */
export interface InboundBody {
  readonly html: string | null;
  readonly text: string | null;
}

/**
 * Injectable seams for testing: the env source, the signature verifier, the body
 * second-hop, the token resolver, the daily-volume counter, the dedupe pre-check,
 * the event-row claim, the import core, the notification writer, and the log sink.
 * All default to the real implementations so the route adapter passes nothing.
 */
export interface InboundWebhookDeps {
  readonly env?: Record<string, string | undefined>;
  readonly verify?: (secret: string, rawBody: string, headers: SvixHeaders) => unknown;
  readonly fetchBody?: (emailId: string, env: Record<string, string | undefined>) => Promise<InboundBody>;
  readonly resolveToken?: (token: string) => Promise<TokenResolution>;
  readonly countRecentInbound?: (userId: string) => Promise<number>;
  readonly isProcessed?: (emailId: string) => Promise<boolean>;
  readonly claimEvent?: (emailId: string, userId: string) => Promise<boolean>;
  readonly importItems?: (args: { userId: string; ctx: AuthContext; items: ReturnType<typeof parseReceipt> }) => Promise<ReceiptImportOutcome>;
  readonly notify?: (userId: string, count: number) => Promise<void>;
  readonly log?: (message: string) => void;
}

const OK: InboundWebhookResult = { status: 200, body: { received: true } };
const UNAUTHORIZED: InboundWebhookResult = { status: 401, body: { error: 'unauthorized' } };
const RETRY: InboundWebhookResult = { status: 500, body: { error: 'retry' } };

/** True only when the inbound webhook has a real (non-placeholder) secret. */
export function isInboundWebhookConfigured(env: Record<string, string | undefined>): boolean {
  return isRealCredential(env.RESEND_INBOUND_WEBHOOK_SECRET);
}

/** Default verifier: Svix over the raw payload. Throws on a bad/absent signature. */
function verifyWithSvix(secret: string, rawBody: string, headers: SvixHeaders): unknown {
  return new Webhook(secret).verify(rawBody, headers);
}

/** Default second hop: GET the received email's body, Bearer RESEND_API_KEY. */
async function fetchBodyFromResend(emailId: string, env: Record<string, string | undefined>): Promise<InboundBody> {
  const key = env.RESEND_API_KEY;
  if (!isRealCredential(key)) {
    // Secret is provisioned but the API key isn't — a misconfiguration. Treat as
    // transient (500 → retry) rather than silently dropping the email.
    throw new Error('inbound body fetch not configured');
  }
  const response = await fetch(`${RECEIVING_BODY_URL}/${encodeURIComponent(emailId)}`, {
    headers: { Authorization: `Bearer ${key}` },
    signal: AbortSignal.timeout(SECOND_HOP_TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new Error(`inbound body fetch returned ${response.status}`);
  }
  // Byte-cap the response before buffering it into JSON (throws
  // InboundBodyTooLargeError past the cap → the handler drops it, no retry).
  const raw = await readCappedText(response, MAX_SECOND_HOP_BYTES);
  const json = JSON.parse(raw) as { html?: unknown; text?: unknown };
  return {
    html: typeof json.html === 'string' ? json.html : null,
    text: typeof json.text === 'string' ? json.text : null,
  };
}

/**
 * Read a response body to text with a hard byte cap. Rejects early on a
 * Content-Length past the cap, and enforces the cap on the stream even when the
 * header is absent or lies. Mirrors `readCapped` in lib/url-import.ts.
 * @throws {InboundBodyTooLargeError} when the body exceeds `maxBytes`.
 */
async function readCappedText(response: Response, maxBytes: number): Promise<string> {
  const declared = Number(response.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > maxBytes) {
    response.body?.cancel().catch(() => {});
    throw new InboundBodyTooLargeError();
  }
  const reader = response.body?.getReader();
  if (!reader) {
    return '';
  }
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel().catch(() => {});
        throw new InboundBodyTooLargeError();
      }
      chunks.push(value);
    }
  }
  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(merged);
}

/**
 * Default daily-volume counter: how many inbound emails this user has had
 * processed in the last 24h. Counts the durable `inbound_email_events` ledger by
 * user_id — the cap itself keeps the per-user row set small.
 */
async function countRecentInboundInDb(userId: string): Promise<number> {
  const since = new Date(Date.now() - ONE_DAY_MS);
  const [row] = await db
    .select({ n: count() })
    .from(inboundEmailEvents)
    .where(and(eq(inboundEmailEvents.userId, userId), gte(inboundEmailEvents.processedAt, since)));
  return row?.n ?? 0;
}

/** Default dedupe pre-check: has this email_id already been processed? */
async function isProcessedInDb(emailId: string): Promise<boolean> {
  const [row] = await db
    .select({ emailId: inboundEmailEvents.emailId })
    .from(inboundEmailEvents)
    .where(eq(inboundEmailEvents.emailId, emailId))
    .limit(1);
  return row !== undefined;
}

/**
 * Default claim: insert the event row as the dedupe gate. Returns true when THIS
 * call claimed it (a row was inserted), false when it already existed (a replay
 * that raced past the pre-check). `onConflictDoNothing` on the email_id PK makes
 * the claim atomic against a concurrent delivery.
 */
async function claimEventInDb(emailId: string, userId: string): Promise<boolean> {
  const inserted = await db
    .insert(inboundEmailEvents)
    .values({ emailId, userId })
    .onConflictDoNothing({ target: inboundEmailEvents.emailId })
    .returning({ emailId: inboundEmailEvents.emailId });
  return inserted.length > 0;
}

/** Default notification writer: the async counterpart to the paste-path toast. */
async function notifyInDb(userId: string, count: number): Promise<void> {
  await db.insert(inAppNotifications).values({
    userId,
    kind: 'receipt_import',
    payload: { count, message: strings.settings.receiptAddress.newDrafts(count) },
  });
}

/** Lowercased sender domain from a `from` address (bare or `Name <addr>`), or ''. */
function domainFromAddress(from: unknown): string {
  if (typeof from !== 'string') return '';
  const angle = /<([^>]+)>/.exec(from)?.[1];
  const candidate = angle ?? from;
  const at = candidate.lastIndexOf('@');
  if (at === -1) return '';
  const domain = candidate
    .slice(at + 1)
    .trim()
    .replace(/[>\s].*$/, '')
    .toLowerCase();
  return /^[a-z0-9.-]+$/.test(domain) ? domain : '';
}

/** Local-part (before the '@') of an address, unwrapping a `Name <addr>` form. */
function localPart(address: unknown): string {
  if (typeof address !== 'string') return '';
  // Prefer the address inside angle brackets; else the bare token.
  const target = /<([^>]+)>/.exec(address)?.[1] ?? address;
  const at = target.indexOf('@');
  return at === -1 ? '' : target.slice(0, at).trim();
}

/**
 * Pull the FIRST token-shaped local-part from the event's recipient lists,
 * lowercased. Scans `data.to` then `data.received_for`. Returns null when no
 * recipient is a `u_<token>` address (the expected catch-all noise path).
 */
function extractToken(data: Record<string, unknown>): string | null {
  const lists: unknown[] = [];
  for (const key of ['to', 'received_for'] as const) {
    const value = data[key];
    if (Array.isArray(value)) lists.push(...value);
    else if (typeof value === 'string') lists.push(value);
  }
  for (const address of lists) {
    const match = TOKEN_LOCALPART_RE.exec(localPart(address));
    if (match) return match[1]!.toLowerCase();
  }
  return null;
}

/**
 * Process one inbound-receipt webhook delivery. Pure of `next/server`; the route
 * adapter turns the result into a response. Assumes the caller applied the
 * body-size cap.
 */
export async function handleInboundWebhook(
  input: InboundWebhookInput,
  deps: InboundWebhookDeps = {},
): Promise<InboundWebhookResult> {
  const env = deps.env ?? process.env;
  const log = deps.log ?? console.log;

  // Dormant until provisioned: no real secret → do no work.
  const secret = env.RESEND_INBOUND_WEBHOOK_SECRET;
  if (!isRealCredential(secret)) {
    return { status: 503, body: { error: 'webhook not configured' } };
  }

  // A missing/empty or over-cap body can't carry a valid signature → 401.
  if (input.rawBody.length === 0 || input.rawBody.length > MAX_INBOUND_WEBHOOK_BODY_BYTES) {
    return UNAUTHORIZED;
  }

  // Verify over the RAW bytes. Any failure throws → 401, no work. Never echo the
  // error (could carry header material) and never log the secret.
  let event: unknown;
  try {
    const verify = deps.verify ?? verifyWithSvix;
    event = verify(secret, input.rawBody, input.headers);
  } catch {
    return UNAUTHORIZED;
  }

  const type = (event as { type?: unknown } | null)?.type;
  if (type !== 'email.received') {
    // Verified but not an inbound-received event: accept + ignore.
    log(`[era-inbound] event ${typeof type === 'string' ? type : 'unknown'}: ignored`);
    return OK;
  }

  const data = (event as { data?: unknown }).data;
  if (typeof data !== 'object' || data === null) {
    return OK; // Malformed received event — nothing to route.
  }
  const record = data as Record<string, unknown>;

  const emailId = record.email_id;
  if (typeof emailId !== 'string' || emailId === '') {
    return OK; // No id to dedupe on — accept + ignore.
  }

  const token = extractToken(record);
  if (token === null) {
    // Catch-all noise: some other local-part on the subdomain. Never echo it.
    log('[era-inbound] received: no token recipient');
    return OK;
  }

  const resolve = deps.resolveToken ?? ((t: string) => resolveToken(db, t));
  const resolution = await resolve(token);
  if (resolution.status !== 'active') {
    // Unknown token, or a hard-killed (revoked) address — silent drop, class only.
    log(`[era-inbound] received: token ${resolution.status}`);
    return OK;
  }
  const userId = resolution.userId;

  // Dedupe pre-check: skip the second hop entirely on a known replay.
  const isProcessed = deps.isProcessed ?? isProcessedInDb;
  if (await isProcessed(emailId)) {
    log('[era-inbound] received: duplicate (pre-check)');
    return OK;
  }

  // Per-user daily-volume cap: bound the draft-row flood a leaked address enables.
  // Checked BEFORE the second hop and BEFORE the claim — capped mail is NOT
  // claimed (a retry tomorrow is judged against the then-current 24h count).
  const countRecentInbound = deps.countRecentInbound ?? countRecentInboundInDb;
  if ((await countRecentInbound(userId)) >= MAX_INBOUND_PER_DAY) {
    log('[era-inbound] received: daily inbound cap');
    return OK;
  }

  // Second hop: fetch the body. A transient failure → 500 so Resend retries (we
  // have NOT claimed the event row yet, so the retry redoes it cleanly). An
  // oversized body is PERMANENT → drop it (200, no claim); retrying never shrinks.
  let body: InboundBody;
  try {
    const fetchBody = deps.fetchBody ?? fetchBodyFromResend;
    body = await fetchBody(emailId, env);
  } catch (error) {
    if (error instanceof InboundBodyTooLargeError) {
      log('[era-inbound] received: body too large');
      return OK;
    }
    log(`[era-inbound] received: body fetch failed (${error instanceof Error ? error.name : 'unknown'})`);
    return RETRY;
  }

  // Build the ParsedEmail directly from the event metadata + fetched body (no
  // RFC822 reconstruction) and lift its line items.
  const email: ParsedEmail = {
    fromDomain: domainFromAddress(record.from),
    subject: typeof record.subject === 'string' ? record.subject : '',
    html: body.html,
    text: body.text,
  };
  const items = parseReceipt(email);

  // Claim the event row — the dedupe gate. If a concurrent delivery claimed it
  // between the pre-check and here, we lose the claim → skip (do NOT import).
  const claimEvent = deps.claimEvent ?? claimEventInDb;
  const claimed = await claimEvent(emailId, userId);
  if (!claimed) {
    log('[era-inbound] received: duplicate (claim raced)');
    return OK;
  }

  // Import drafts. R2 image side-effects live outside any txn; on a mid-import
  // crash they are acceptable orphans and the claimed email's drafts are lost.
  // The import core is loaded lazily (dynamic import) so unit tests — which inject
  // `importItems` — never pull in the item-pipeline module graph.
  const importItems =
    deps.importItems ??
    (async (args: Parameters<NonNullable<InboundWebhookDeps['importItems']>>[0]) => {
      const { importReceiptItems } = await import('./receipt-import-server.ts');
      return importReceiptItems(args);
    });
  const outcome = await importItems({ userId, ctx: { userId }, items });

  if (outcome.imported.length > 0) {
    const notify = deps.notify ?? notifyInDb;
    await notify(userId, outcome.imported.length);
  }

  log('[era-inbound] received: imported');
  return OK;
}
