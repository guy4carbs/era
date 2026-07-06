/**
 * Unit tests for the Resend Svix webhook handler logic.
 *
 * No live DB and no real signature check: `verify` and `suppress` are injected,
 * so we assert the full contract deterministically —
 *   - no real secret        → 503, no verify, no suppress
 *   - placeholder secret     → 503 (treated as absent)
 *   - bad/missing signature  → 401 (verify throws), no suppress
 *   - empty / oversized body → 401, no verify
 *   - email.bounced          → suppress(email,'bounced'), 200
 *   - email.complained       → suppress(email,'complained'), 200
 *   - email.delivered        → NO suppress, 200
 *   - suppression w/o recipient / failed write → 200, no retry storm
 *
 * The route (`api/webhooks/resend/route.ts`) is a thin adapter over this — it
 * only reads the raw body + headers and maps `{ status, body }` to a response.
 *
 * Run: node --experimental-strip-types --test apps/web/src/lib/resend-webhook.test.ts
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  MAX_WEBHOOK_BODY_BYTES,
  handleResendWebhook,
  isWebhookConfigured,
  type ResendWebhookDeps,
  type SvixHeaders,
} from './resend-webhook.ts';

const REAL_SECRET = 'whsec_realsecret123';
const HEADERS: SvixHeaders = { 'svix-id': 'msg_1', 'svix-timestamp': '1700000000', 'svix-signature': 'v1,deadbeef' };

/** A verified webhook delivery: the raw body + Svix headers. */
function delivery(body: unknown): { rawBody: string; headers: SvixHeaders } {
  return { rawBody: JSON.stringify(body), headers: HEADERS };
}

/** A suppress spy that records (email, reason) pairs. */
function spySuppress(): {
  suppress: NonNullable<ResendWebhookDeps['suppress']>;
  calls: Array<{ email: string; reason: string }>;
} {
  const calls: Array<{ email: string; reason: string }> = [];
  return {
    suppress: (email, reason) => {
      calls.push({ email, reason });
      return Promise.resolve();
    },
    calls,
  };
}

/** verify that echoes the parsed body (a valid signature). */
const verifyOk: NonNullable<ResendWebhookDeps['verify']> = (_secret, rawBody) => JSON.parse(rawBody);

test('no real secret → 503, does no work', async () => {
  const spy = spySuppress();
  let verifyCalls = 0;
  const res = await handleResendWebhook(delivery({ type: 'email.bounced', data: { to: 'a@b.com' } }), {
    env: {},
    verify: () => {
      verifyCalls += 1;
      return {};
    },
    suppress: spy.suppress,
  });
  assert.equal(res.status, 503);
  assert.equal(verifyCalls, 0);
  assert.equal(spy.calls.length, 0);
});

test('placeholder secret is treated as absent → 503', async () => {
  const res = await handleResendWebhook(delivery({ type: 'email.bounced', data: { to: 'a@b.com' } }), {
    env: { RESEND_WEBHOOK_SECRET: 'change-me-webhook-secret' },
    verify: verifyOk,
    suppress: spySuppress().suppress,
  });
  assert.equal(res.status, 503);
});

test('isWebhookConfigured mirrors the dormancy gate', () => {
  assert.equal(isWebhookConfigured({}), false);
  assert.equal(isWebhookConfigured({ RESEND_WEBHOOK_SECRET: 'change-me-x' }), false);
  assert.equal(isWebhookConfigured({ RESEND_WEBHOOK_SECRET: REAL_SECRET }), true);
});

test('bad signature → 401, no suppression', async () => {
  const spy = spySuppress();
  const res = await handleResendWebhook(delivery({ type: 'email.bounced', data: { to: 'a@b.com' } }), {
    env: { RESEND_WEBHOOK_SECRET: REAL_SECRET },
    verify: () => {
      throw new Error('signature mismatch');
    },
    suppress: spy.suppress,
  });
  assert.equal(res.status, 401);
  assert.equal(spy.calls.length, 0);
});

test('empty body → 401 before any verify', async () => {
  const spy = spySuppress();
  let verifyCalls = 0;
  const res = await handleResendWebhook(
    { rawBody: '', headers: HEADERS },
    {
      env: { RESEND_WEBHOOK_SECRET: REAL_SECRET },
      verify: () => {
        verifyCalls += 1;
        return {};
      },
      suppress: spy.suppress,
    },
  );
  assert.equal(res.status, 401);
  assert.equal(verifyCalls, 0);
  assert.equal(spy.calls.length, 0);
});

test('oversized body → 401 before any verify', async () => {
  let verifyCalls = 0;
  const res = await handleResendWebhook(
    { rawBody: 'x'.repeat(MAX_WEBHOOK_BODY_BYTES + 1), headers: HEADERS },
    {
      env: { RESEND_WEBHOOK_SECRET: REAL_SECRET },
      verify: () => {
        verifyCalls += 1;
        return {};
      },
    },
  );
  assert.equal(res.status, 401);
  assert.equal(verifyCalls, 0);
});

test('email.bounced → suppresses the recipient (lowercased) and 200', async () => {
  const spy = spySuppress();
  const res = await handleResendWebhook(delivery({ type: 'email.bounced', data: { to: 'Bounce@Example.COM' } }), {
    env: { RESEND_WEBHOOK_SECRET: REAL_SECRET },
    verify: verifyOk,
    suppress: spy.suppress,
    log: () => {},
  });
  assert.equal(res.status, 200);
  assert.deepEqual(res.body, { received: true });
  assert.deepEqual(spy.calls, [{ email: 'bounce@example.com', reason: 'bounced' }]);
});

test('email.complained (recipient array) → suppresses first address and 200', async () => {
  const spy = spySuppress();
  const res = await handleResendWebhook(delivery({ type: 'email.complained', data: { to: ['spam@example.com'] } }), {
    env: { RESEND_WEBHOOK_SECRET: REAL_SECRET },
    verify: verifyOk,
    suppress: spy.suppress,
    log: () => {},
  });
  assert.equal(res.status, 200);
  assert.deepEqual(spy.calls, [{ email: 'spam@example.com', reason: 'complained' }]);
});

test('email.delivered → accepted, NO suppression, 200', async () => {
  const spy = spySuppress();
  const res = await handleResendWebhook(delivery({ type: 'email.delivered', data: { to: 'ok@example.com' } }), {
    env: { RESEND_WEBHOOK_SECRET: REAL_SECRET },
    verify: verifyOk,
    suppress: spy.suppress,
    log: () => {},
  });
  assert.equal(res.status, 200);
  assert.equal(spy.calls.length, 0);
});

test('suppression event with no recipient → accepted, no suppression, 200', async () => {
  const spy = spySuppress();
  const res = await handleResendWebhook(delivery({ type: 'email.bounced', data: {} }), {
    env: { RESEND_WEBHOOK_SECRET: REAL_SECRET },
    verify: verifyOk,
    suppress: spy.suppress,
    log: () => {},
  });
  assert.equal(res.status, 200);
  assert.equal(spy.calls.length, 0);
});

test('a failed suppression write is swallowed → still 200 (no Resend retry storm)', async () => {
  const res = await handleResendWebhook(delivery({ type: 'email.bounced', data: { to: 'a@b.com' } }), {
    env: { RESEND_WEBHOOK_SECRET: REAL_SECRET },
    verify: verifyOk,
    suppress: () => Promise.reject(new Error('db down')),
    log: () => {},
  });
  assert.equal(res.status, 200);
});
