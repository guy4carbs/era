/**
 * Unit tests for the Expo push sender. No live Expo is touched — `fetch` is
 * injected. Covers the DORMANT no-op (no tokens → no network), token validation,
 * the request shape, and the never-throw failure paths.
 *
 * Run: node --experimental-strip-types --test apps/web/src/lib/expo-push.test.ts
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { sendExpoPush } from './expo-push.ts';

const VALID = 'ExponentPushToken[abc123]';

test('dormant: no tokens → no fetch, no throw', async () => {
  let called = false;
  await sendExpoPush([], { title: 't', body: 'b' }, {
    fetchImpl: (() => {
      called = true;
      return Promise.reject(new Error('must not be called'));
    }) as typeof fetch,
  });
  assert.equal(called, false);
});

test('drops non-Expo tokens; when none remain it does not fetch', async () => {
  let called = false;
  await sendExpoPush(['not-a-token', 'also bad'], { title: 't', body: 'b' }, {
    fetchImpl: (() => {
      called = true;
      return Promise.reject(new Error('must not be called'));
    }) as typeof fetch,
  });
  assert.equal(called, false);
});

test('valid tokens → POSTs the Expo endpoint with a message per token', async () => {
  let seenUrl = '';
  let seenBody: unknown;
  const fetchImpl = ((url: unknown, init?: RequestInit) => {
    seenUrl = String(url);
    seenBody = JSON.parse(String(init?.body));
    return Promise.resolve(new Response('{}', { status: 200 }));
  }) as typeof fetch;

  await sendExpoPush([VALID, 'ExpoPushToken[def456]'], { title: 'Coat', body: 'cheaper', data: { kind: 'price_drop' } }, { fetchImpl });

  assert.match(seenUrl, /exp\.host\/--\/api\/v2\/push\/send$/);
  assert.ok(Array.isArray(seenBody));
  const messages = seenBody as Array<{ to: string; title: string; body: string; data?: unknown }>;
  assert.equal(messages.length, 2);
  assert.equal(messages[0]!.to, VALID);
  assert.equal(messages[0]!.title, 'Coat');
  assert.deepEqual(messages[0]!.data, { kind: 'price_drop' });
});

test('non-2xx is logged (token-free) and never thrown', async () => {
  const logs: string[] = [];
  await sendExpoPush([VALID], { title: 't', body: 'b' }, {
    fetchImpl: (() => Promise.resolve(new Response('nope', { status: 502 }))) as typeof fetch,
    log: (m) => logs.push(m),
  });
  assert.equal(logs.length, 1);
  assert.match(logs[0]!, /502/);
  assert.ok(!logs[0]!.includes(VALID), 'the token must never appear in a log line');
});

test('transport error is logged and never thrown', async () => {
  const logs: string[] = [];
  await sendExpoPush([VALID], { title: 't', body: 'b' }, {
    fetchImpl: (() => Promise.reject(new Error('ECONNRESET'))) as typeof fetch,
    log: (m) => logs.push(m),
  });
  assert.equal(logs.length, 1);
  assert.ok(!logs[0]!.includes(VALID));
});
