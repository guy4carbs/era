/**
 * Unit tests for the Resend Audience sync helpers' dormant-credential activation.
 *
 * No live HTTP: the `fetch` is stubbed and env is injected, so we assert the full
 * dormancy + best-effort truth-table without touching process globals —
 *   - no real key            → no-op, no fetch
 *   - no audience id         → no-op, no fetch
 *   - real key + audience id → POST/DELETE the contact with a Bearer header
 *   - non-2xx / network error → swallowed (never throws), logged by class only
 *
 * Run: node --experimental-strip-types --test apps/web/src/lib/resend-audience.test.ts
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { addContactToAudience, removeContactFromAudience } from './resend-audience.ts';

const REAL_KEY = 're_live_realkey123';
const AUDIENCE_ID = 'aud_123';
const WIRED = { RESEND_API_KEY: REAL_KEY, RESEND_AUDIENCE_ID: AUDIENCE_ID };

/** A fetch stub that records its calls and returns a canned Response. */
function stubFetch(status = 200): { fetch: typeof fetch; calls: Array<{ url: string; init?: RequestInit }> } {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const fetchImpl = ((input: unknown, init?: RequestInit) => {
    calls.push({ url: String(input), init });
    return Promise.resolve(new Response(status < 300 ? '{"id":"c"}' : 'error', { status }));
  }) as typeof fetch;
  return { fetch: fetchImpl, calls };
}

test('add: dormant no-op without a real key', async () => {
  const { fetch, calls } = stubFetch();
  await addContactToAudience(
    { email: 'a@b.com' },
    { env: { RESEND_API_KEY: 'change-me-resend-api-key', RESEND_AUDIENCE_ID: AUDIENCE_ID }, fetchImpl: fetch },
  );
  assert.equal(calls.length, 0);
});

test('add: dormant no-op without an audience id', async () => {
  const { fetch, calls } = stubFetch();
  await addContactToAudience({ email: 'a@b.com' }, { env: { RESEND_API_KEY: REAL_KEY }, fetchImpl: fetch });
  assert.equal(calls.length, 0);
});

test('add: real key + audience id → POSTs the contact with a Bearer header', async () => {
  const { fetch, calls } = stubFetch(201);
  await addContactToAudience({ email: 'new@example.com', firstName: 'Ada' }, { env: WIRED, fetchImpl: fetch });

  assert.equal(calls.length, 1);
  assert.equal(calls[0]!.url, `https://api.resend.com/audiences/${AUDIENCE_ID}/contacts`);
  const init = calls[0]!.init!;
  assert.equal(init.method, 'POST');
  assert.equal((init.headers as Record<string, string>).Authorization, `Bearer ${REAL_KEY}`);
  const body = JSON.parse(init.body as string);
  assert.equal(body.email, 'new@example.com');
  assert.equal(body.first_name, 'Ada');
});

test('add: a non-2xx response is swallowed (never throws)', async () => {
  const { fetch, calls } = stubFetch(422);
  await addContactToAudience({ email: 'a@b.com' }, { env: WIRED, fetchImpl: fetch, log: () => {} });
  assert.equal(calls.length, 1); // attempted, but the failure did not propagate
});

test('add: a network error is swallowed (never throws)', async () => {
  const fetchImpl = (() => Promise.reject(new Error('ECONNRESET'))) as typeof fetch;
  await addContactToAudience({ email: 'a@b.com' }, { env: WIRED, fetchImpl, log: () => {} });
  // reaching here without throwing is the assertion
  assert.ok(true);
});

test('remove: dormant no-op without env', async () => {
  const { fetch, calls } = stubFetch();
  await removeContactFromAudience({ email: 'a@b.com' }, { env: {}, fetchImpl: fetch });
  assert.equal(calls.length, 0);
});

test('remove: real key + audience id → DELETEs the contact by email', async () => {
  const { fetch, calls } = stubFetch(200);
  await removeContactFromAudience({ email: 'gone@example.com' }, { env: WIRED, fetchImpl: fetch });

  assert.equal(calls.length, 1);
  assert.equal(calls[0]!.init!.method, 'DELETE');
  assert.equal(
    calls[0]!.url,
    `https://api.resend.com/audiences/${AUDIENCE_ID}/contacts/${encodeURIComponent('gone@example.com')}`,
  );
  assert.equal((calls[0]!.init!.headers as Record<string, string>).Authorization, `Bearer ${REAL_KEY}`);
});
