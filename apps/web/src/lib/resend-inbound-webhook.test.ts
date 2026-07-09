/**
 * Unit tests for the inbound-receipt Svix webhook handler logic.
 *
 * No live DB, no real signature check, no real second hop: every seam (verify,
 * fetchBody, resolveToken, isProcessed, claimEvent, importItems, notify) is
 * injected, so the full contract is deterministic —
 *   - no real / placeholder secret → 503, no work
 *   - empty / oversized body       → 401, no verify
 *   - bad signature                → 401, no work
 *   - non-received event           → 200, no import
 *   - no token-shaped recipient    → 200, no resolve/import (catch-all noise)
 *   - unknown / revoked token      → 200, silent drop, no fetch/claim/import
 *   - dedupe pre-check hit         → 200, no second hop, no claim
 *   - second-hop transient failure → 500 (Resend retries), NOT claimed
 *   - claim raced (already existed)→ 200, no import
 *   - happy path                   → claim + import + notify(n), 200
 *   - n=0 drafts                   → no notify
 *   - response/log hygiene         → no address/token/subject leaks
 *
 * Run: node --experimental-strip-types --test apps/web/src/lib/resend-inbound-webhook.test.ts
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  MAX_INBOUND_WEBHOOK_BODY_BYTES,
  handleInboundWebhook,
  isInboundWebhookConfigured,
  type InboundBody,
  type InboundWebhookDeps,
} from './resend-inbound-webhook.ts';
import type { SvixHeaders } from './resend-webhook.ts';
import type { ReceiptImportOutcome } from './receipt-import-server.ts';

const REAL_SECRET = 'whsec_inboundsecret123';
const HEADERS: SvixHeaders = { 'svix-id': 'msg_1', 'svix-timestamp': '1700000000', 'svix-signature': 'v1,deadbeef' };
const TOKEN = 'a1b2c3d4e5f6a7b8c9d0e1f2'; // 24 lowercase hex chars
const RECIPIENT = `u_${TOKEN}@in.era.style`;
const USER = 'user-1';
const EMAIL_ID = 'email_abc123';

/** A verified webhook delivery: the raw body + Svix headers. */
function delivery(body: unknown): { rawBody: string; headers: SvixHeaders } {
  return { rawBody: JSON.stringify(body), headers: HEADERS };
}

/** verify that echoes the parsed body (a valid signature). */
const verifyOk: NonNullable<InboundWebhookDeps['verify']> = (_secret, rawBody) => JSON.parse(rawBody);

/** A well-formed `email.received` event routed to our token recipient. */
function receivedEvent(over: Record<string, unknown> = {}): unknown {
  return {
    type: 'email.received',
    data: {
      email_id: EMAIL_ID,
      from: 'orders@e.zara.com',
      to: [RECIPIENT],
      subject: 'Your Zara order',
      ...over,
    },
  };
}

/** An outcome with `n` imported drafts. */
function outcome(n: number): ReceiptImportOutcome {
  return { imported: Array.from({ length: n }, (_v, i) => ({ id: `i${i}`, name: 'Tee', category: 'top' })), skipped: 0 };
}

/** A spy bundle recording every seam invocation, with sensible passing defaults. */
function spies(over: Partial<InboundWebhookDeps> = {}) {
  const calls = {
    fetchBody: [] as string[],
    resolveToken: [] as string[],
    isProcessed: [] as string[],
    claimEvent: [] as Array<{ emailId: string; userId: string }>,
    importItems: [] as Array<{ userId: string; count: number }>,
    notify: [] as Array<{ userId: string; count: number }>,
    logs: [] as string[],
  };
  const deps: InboundWebhookDeps = {
    env: { RESEND_INBOUND_WEBHOOK_SECRET: REAL_SECRET },
    verify: verifyOk,
    fetchBody: (emailId) => {
      calls.fetchBody.push(emailId);
      return Promise.resolve<InboundBody>({ html: '<p>receipt</p>', text: 'receipt' });
    },
    resolveToken: (token) => {
      calls.resolveToken.push(token);
      return Promise.resolve({ status: 'active', userId: USER } as const);
    },
    isProcessed: (emailId) => {
      calls.isProcessed.push(emailId);
      return Promise.resolve(false);
    },
    claimEvent: (emailId, userId) => {
      calls.claimEvent.push({ emailId, userId });
      return Promise.resolve(true);
    },
    importItems: (args) => {
      calls.importItems.push({ userId: args.userId, count: args.items.length });
      return Promise.resolve(outcome(2));
    },
    notify: (userId, count) => {
      calls.notify.push({ userId, count });
      return Promise.resolve();
    },
    log: (m) => {
      calls.logs.push(m);
    },
    ...over,
  };
  return { deps, calls };
}

// --- dormancy + auth --------------------------------------------------------

test('no real secret → 503, does no work', async () => {
  const { deps, calls } = spies({ env: {} });
  const res = await handleInboundWebhook(delivery(receivedEvent()), deps);
  assert.equal(res.status, 503);
  assert.equal(calls.resolveToken.length, 0);
  assert.equal(calls.fetchBody.length, 0);
  assert.equal(calls.importItems.length, 0);
});

test('placeholder secret is treated as absent → 503', async () => {
  const { deps } = spies({ env: { RESEND_INBOUND_WEBHOOK_SECRET: 'change-me-inbound-secret' } });
  const res = await handleInboundWebhook(delivery(receivedEvent()), deps);
  assert.equal(res.status, 503);
});

test('isInboundWebhookConfigured mirrors the dormancy gate', () => {
  assert.equal(isInboundWebhookConfigured({}), false);
  assert.equal(isInboundWebhookConfigured({ RESEND_INBOUND_WEBHOOK_SECRET: 'change-me-x' }), false);
  assert.equal(isInboundWebhookConfigured({ RESEND_INBOUND_WEBHOOK_SECRET: REAL_SECRET }), true);
});

test('empty body → 401 before any verify', async () => {
  let verifyCalls = 0;
  const { deps } = spies({
    verify: () => {
      verifyCalls += 1;
      return {};
    },
  });
  const res = await handleInboundWebhook({ rawBody: '', headers: HEADERS }, deps);
  assert.equal(res.status, 401);
  assert.equal(verifyCalls, 0);
});

test('oversized body → 401 before any verify', async () => {
  let verifyCalls = 0;
  const { deps } = spies({
    verify: () => {
      verifyCalls += 1;
      return {};
    },
  });
  const res = await handleInboundWebhook(
    { rawBody: 'x'.repeat(MAX_INBOUND_WEBHOOK_BODY_BYTES + 1), headers: HEADERS },
    deps,
  );
  assert.equal(res.status, 401);
  assert.equal(verifyCalls, 0);
});

test('bad signature → 401, no work', async () => {
  const { deps, calls } = spies({
    verify: () => {
      throw new Error('signature mismatch');
    },
  });
  const res = await handleInboundWebhook(delivery(receivedEvent()), deps);
  assert.equal(res.status, 401);
  assert.equal(calls.resolveToken.length, 0);
  assert.equal(calls.importItems.length, 0);
});

// --- routing / no-op paths --------------------------------------------------

test('non-received event → 200, no import', async () => {
  const { deps, calls } = spies();
  const res = await handleInboundWebhook(delivery({ type: 'email.delivered', data: { to: [RECIPIENT] } }), deps);
  assert.equal(res.status, 200);
  assert.deepEqual(res.body, { received: true });
  assert.equal(calls.resolveToken.length, 0);
  assert.equal(calls.importItems.length, 0);
});

test('no token-shaped recipient → 200, no resolve/import (catch-all noise)', async () => {
  const { deps, calls } = spies();
  const res = await handleInboundWebhook(
    delivery(receivedEvent({ to: ['hello@in.era.style'], received_for: ['marketing@in.era.style'] })),
    deps,
  );
  assert.equal(res.status, 200);
  assert.equal(calls.resolveToken.length, 0);
  assert.equal(calls.fetchBody.length, 0);
  assert.equal(calls.importItems.length, 0);
});

test('token is read from received_for when to has none, and lowercased', async () => {
  const { deps, calls } = spies();
  const res = await handleInboundWebhook(
    delivery(receivedEvent({ to: ['noise@in.era.style'], received_for: [`u_${TOKEN.toUpperCase()}@in.era.style`] })),
    deps,
  );
  assert.equal(res.status, 200);
  assert.deepEqual(calls.resolveToken, [TOKEN]); // lowercased
});

test('unknown token → 200, silent drop, no fetch/claim/import', async () => {
  const { deps, calls } = spies({
    resolveToken: () => Promise.resolve({ status: 'unknown' } as const),
  });
  const res = await handleInboundWebhook(delivery(receivedEvent()), deps);
  assert.equal(res.status, 200);
  assert.equal(calls.fetchBody.length, 0);
  assert.equal(calls.claimEvent.length, 0);
  assert.equal(calls.importItems.length, 0);
});

test('revoked token → 200, silent drop (hard kill), no import', async () => {
  const { deps, calls } = spies({
    resolveToken: () => Promise.resolve({ status: 'revoked' } as const),
  });
  const res = await handleInboundWebhook(delivery(receivedEvent()), deps);
  assert.equal(res.status, 200);
  assert.equal(calls.fetchBody.length, 0);
  assert.equal(calls.importItems.length, 0);
});

// --- idempotency ------------------------------------------------------------

test('dedupe pre-check hit → 200, no second hop, no claim, no import', async () => {
  const { deps, calls } = spies({
    isProcessed: () => Promise.resolve(true),
  });
  const res = await handleInboundWebhook(delivery(receivedEvent()), deps);
  assert.equal(res.status, 200);
  // The pre-check short-circuits: no second hop, no claim, no import.
  assert.equal(calls.fetchBody.length, 0);
  assert.equal(calls.claimEvent.length, 0);
  assert.equal(calls.importItems.length, 0);
});

test('claim raced (row already existed) → 200, no import, no notify', async () => {
  const { deps, calls } = spies({
    claimEvent: () => Promise.resolve(false),
  });
  const res = await handleInboundWebhook(delivery(receivedEvent()), deps);
  assert.equal(res.status, 200);
  assert.equal(calls.fetchBody.length, 1); // fetched before the claim
  assert.equal(calls.importItems.length, 0);
  assert.equal(calls.notify.length, 0);
});

// --- second hop -------------------------------------------------------------

test('second-hop transient failure → 500, NOT claimed (Resend retries)', async () => {
  const { deps, calls } = spies({
    fetchBody: () => Promise.reject(new Error('resend 503')),
  });
  const res = await handleInboundWebhook(delivery(receivedEvent()), deps);
  assert.equal(res.status, 500);
  assert.deepEqual(res.body, { error: 'retry' });
  assert.equal(calls.claimEvent.length, 0);
  assert.equal(calls.importItems.length, 0);
});

// --- happy path -------------------------------------------------------------

test('happy path → claim + import + notify(n), 200', async () => {
  const { deps, calls } = spies();
  const res = await handleInboundWebhook(delivery(receivedEvent()), deps);
  assert.equal(res.status, 200);
  assert.deepEqual(res.body, { received: true });
  // Order: pre-check, second hop, then claim, then import.
  assert.deepEqual(calls.isProcessed, [EMAIL_ID]);
  assert.deepEqual(calls.fetchBody, [EMAIL_ID]);
  assert.deepEqual(calls.claimEvent, [{ emailId: EMAIL_ID, userId: USER }]);
  assert.equal(calls.importItems.length, 1);
  assert.equal(calls.importItems[0]!.userId, USER);
  assert.deepEqual(calls.notify, [{ userId: USER, count: 2 }]);
});

test('n=0 imported drafts → NO notification', async () => {
  const { deps, calls } = spies({
    importItems: () => Promise.resolve(outcome(0)),
  });
  const res = await handleInboundWebhook(delivery(receivedEvent()), deps);
  assert.equal(res.status, 200);
  assert.equal(calls.claimEvent.length, 1); // still claimed
  assert.equal(calls.notify.length, 0); // but no notification
});

// --- hygiene ----------------------------------------------------------------

test('no address, token, or subject ever leaks into the response or logs', async () => {
  const { deps, calls } = spies();
  const res = await handleInboundWebhook(delivery(receivedEvent({ subject: 'SECRET-ORDER-#42' })), deps);

  const serialized = JSON.stringify(res.body) + '\n' + calls.logs.join('\n');
  assert.ok(!serialized.includes(TOKEN), 'token must not leak');
  assert.ok(!serialized.includes('in.era.style'), 'recipient address must not leak');
  assert.ok(!serialized.includes('SECRET-ORDER-#42'), 'subject must not leak');
  // The 200 body is a fixed enum shape.
  assert.deepEqual(res.body, { received: true });
});
