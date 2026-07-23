/**
 * email-unsubscribe handler tests — the verify → suppress → audience-drop →
 * redirect contract, with every seam injected (no DB, no real HMAC).
 *
 * Run: node --experimental-strip-types --test apps/web/src/lib/email-unsubscribe.test.ts
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { handleUnsubscribe, UNSUBSCRIBED_PATH } from './email-unsubscribe.ts';

function spies() {
  const suppressed: string[] = [];
  const removed: string[] = [];
  return {
    suppressed,
    removed,
    suppress: (email: string) => {
      suppressed.push(email);
      return Promise.resolve();
    },
    removeFromAudience: (email: string) => {
      removed.push(email);
      return Promise.resolve();
    },
  };
}

test('missing email or token → invalid 400, no side effects', async () => {
  const s = spies();
  const noEmail = await handleUnsubscribe(null, 'tok', { suppress: s.suppress, verify: () => true });
  assert.deepEqual(noEmail, { kind: 'invalid', status: 400 });
  const noToken = await handleUnsubscribe('a@b.com', null, { suppress: s.suppress, verify: () => true });
  assert.deepEqual(noToken, { kind: 'invalid', status: 400 });
  assert.equal(s.suppressed.length, 0, 'never suppresses without both params');
});

test('bad token → invalid 400, never suppresses', async () => {
  const s = spies();
  const res = await handleUnsubscribe('a@b.com', 'wrong', {
    suppress: s.suppress,
    removeFromAudience: s.removeFromAudience,
    verify: () => false,
  });
  assert.deepEqual(res, { kind: 'invalid', status: 400 });
  assert.equal(s.suppressed.length, 0, 'no suppression on an unverified request');
  assert.equal(s.removed.length, 0);
});

test('valid token → suppress(manual) + audience drop + redirect', async () => {
  const s = spies();
  const res = await handleUnsubscribe('a@b.com', 'good', {
    suppress: s.suppress,
    removeFromAudience: s.removeFromAudience,
    verify: () => true,
  });
  assert.deepEqual(res, { kind: 'redirect', path: UNSUBSCRIBED_PATH });
  assert.deepEqual(s.suppressed, ['a@b.com']);
  assert.deepEqual(s.removed, ['a@b.com']);
});

test('audience-drop failure does not fail the unsubscribe', async () => {
  const suppressed: string[] = [];
  const res = await handleUnsubscribe('a@b.com', 'good', {
    suppress: (e) => {
      suppressed.push(e);
      return Promise.resolve();
    },
    removeFromAudience: () => Promise.reject(new Error('resend down')),
    verify: () => true,
  });
  assert.deepEqual(res, { kind: 'redirect', path: UNSUBSCRIBED_PATH });
  assert.deepEqual(suppressed, ['a@b.com'], 'suppression still recorded');
});
