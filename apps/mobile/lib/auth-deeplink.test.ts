import assert from 'node:assert/strict';
import test from 'node:test';

import {
  AUTH_COOKIE_STORAGE_KEY,
  captureAuthSessionFromUrl,
  cookieParamFromUrl,
  mergeSetCookie,
} from './auth-deeplink.ts';

const SESSION_COOKIE =
  'better-auth.session_token=abc123.sig; Max-Age=7776000; Path=/; HttpOnly; Secure; SameSite=Lax';

test('cookieParamFromUrl extracts the cookie from an era:// deep link', () => {
  const url = `era://?cookie=${encodeURIComponent(SESSION_COOKIE)}`;
  assert.equal(cookieParamFromUrl(url), SESSION_COOKIE);
});

test('cookieParamFromUrl ignores non-era schemes and cookieless links', () => {
  assert.equal(cookieParamFromUrl(`https://era.style/?cookie=${encodeURIComponent('x=y')}`), null);
  assert.equal(cookieParamFromUrl('era://some/path'), null);
  assert.equal(cookieParamFromUrl('exp://127.0.0.1:8081?cookie=x%3Dy'), null);
  assert.equal(cookieParamFromUrl('not a url'), null);
});

test('mergeSetCookie stores the plugin JSON shape with an ISO expiry', () => {
  const json = mergeSetCookie(SESSION_COOKIE, null);
  const parsed = JSON.parse(json) as Record<string, { value: string; expires: string | null }>;
  const entry = parsed['better-auth.session_token'];
  assert.ok(entry, 'session token entry stored');
  assert.equal(entry.value, 'abc123.sig');
  assert.ok(entry.expires !== null && !Number.isNaN(Date.parse(entry.expires)), 'ISO expiry');
});

test('mergeSetCookie merges with previous cookies and prunes max-age<=0', () => {
  const prev = mergeSetCookie('other=keep; Max-Age=1000; Path=/', null);
  const merged = JSON.parse(
    mergeSetCookie('better-auth.session_token=; Max-Age=0; Path=/', prev),
  ) as Record<string, unknown>;
  assert.ok(merged['other'], 'previous cookie kept');
  assert.equal(merged['better-auth.session_token'], undefined, 'expired entry pruned');
});

test('mergeSetCookie survives corrupt previous JSON', () => {
  const json = mergeSetCookie(SESSION_COOKIE, '{not json');
  assert.ok(JSON.parse(json)['better-auth.session_token']);
});

test('captureAuthSessionFromUrl stores under the plugin key and notifies', () => {
  const store = new Map<string, string>();
  let notified = 0;
  const captured = captureAuthSessionFromUrl(`era://?cookie=${encodeURIComponent(SESSION_COOKIE)}`, {
    getItem: (k) => store.get(k) ?? null,
    setItem: (k, v) => void store.set(k, v),
    notifySession: () => {
      notified += 1;
    },
  });
  assert.equal(captured, true);
  assert.ok(store.get(AUTH_COOKIE_STORAGE_KEY)?.includes('abc123.sig'));
  assert.equal(notified, 1);
});

test('captureAuthSessionFromUrl no-ops on cookieless URLs', () => {
  let touched = false;
  const captured = captureAuthSessionFromUrl('era://home', {
    getItem: () => null,
    setItem: () => {
      touched = true;
    },
    notifySession: () => {
      touched = true;
    },
  });
  assert.equal(captured, false);
  assert.equal(touched, false);
});
