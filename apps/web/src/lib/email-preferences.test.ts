/**
 * email-preferences core tests — the token-gated read + write, seams injected.
 *
 * Run: node --experimental-strip-types --test apps/web/src/lib/email-preferences.test.ts
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { loadPreferences, updatePreferences, type PreferencesDeps } from './email-preferences.ts';

function makeDeps(overrides: Partial<PreferencesDeps> = {}): PreferencesDeps & {
  subscribed: string[];
  unsubscribed: string[];
} {
  const subscribed: string[] = [];
  const unsubscribed: string[] = [];
  return {
    subscribed,
    unsubscribed,
    isManuallyUnsubscribed: () => Promise.resolve(false),
    subscribe: (e) => {
      subscribed.push(e);
      return Promise.resolve();
    },
    unsubscribe: (e) => {
      unsubscribed.push(e);
      return Promise.resolve();
    },
    verify: () => true,
    ...overrides,
  };
}

test('loadPreferences: bad token → invalid, no DB read', async () => {
  let read = 0;
  const deps = makeDeps({
    verify: () => false,
    isManuallyUnsubscribed: () => {
      read += 1;
      return Promise.resolve(false);
    },
  });
  const view = await loadPreferences('a@b.com', 'bad', deps);
  assert.deepEqual(view, { kind: 'invalid' });
  assert.equal(read, 0, 'never reads state on an unverified request');
});

test('loadPreferences: subscribed when NOT manually unsubscribed', async () => {
  const view = await loadPreferences('a@b.com', 'ok', makeDeps({ isManuallyUnsubscribed: () => Promise.resolve(false) }));
  assert.deepEqual(view, { kind: 'ok', email: 'a@b.com', subscribed: true });
});

test('loadPreferences: unsubscribed when a manual suppression exists', async () => {
  const view = await loadPreferences('a@b.com', 'ok', makeDeps({ isManuallyUnsubscribed: () => Promise.resolve(true) }));
  assert.deepEqual(view, { kind: 'ok', email: 'a@b.com', subscribed: false });
});

test('updatePreferences: subscribe removes the manual suppression', async () => {
  const deps = makeDeps();
  const res = await updatePreferences('a@b.com', 'ok', 'subscribe', deps);
  assert.deepEqual(res, { kind: 'ok', subscribed: true });
  assert.deepEqual(deps.subscribed, ['a@b.com']);
  assert.deepEqual(deps.unsubscribed, []);
});

test('updatePreferences: unsubscribe adds the manual suppression', async () => {
  const deps = makeDeps();
  const res = await updatePreferences('a@b.com', 'ok', 'unsubscribe', deps);
  assert.deepEqual(res, { kind: 'ok', subscribed: false });
  assert.deepEqual(deps.unsubscribed, ['a@b.com']);
  assert.deepEqual(deps.subscribed, []);
});

test('updatePreferences: bad token → invalid, no write', async () => {
  const deps = makeDeps({ verify: () => false });
  const res = await updatePreferences('a@b.com', 'bad', 'unsubscribe', deps);
  assert.deepEqual(res, { kind: 'invalid' });
  assert.deepEqual(deps.subscribed, []);
  assert.deepEqual(deps.unsubscribed, []);
});
