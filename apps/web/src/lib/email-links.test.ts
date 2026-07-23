/**
 * email-links unit tests — the signed unsubscribe/preferences link contract.
 *
 * All deterministic against an injected secret: same address → same token,
 * normalization collapses case/whitespace, a good token verifies, a tampered
 * address or token fails closed, and both builders escape the query values.
 *
 * Run: node --experimental-strip-types --test apps/web/src/lib/email-links.test.ts
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  buildPreferencesUrl,
  buildUnsubscribeUrl,
  emailLinkToken,
  verifyEmailLinkToken,
} from './email-links.ts';

const DEPS = { env: { BETTER_AUTH_SECRET: 'test-secret-please-ignore-0123456789' } };

test('emailLinkToken is deterministic and hex', () => {
  const a = emailLinkToken('you@example.com', DEPS);
  const b = emailLinkToken('you@example.com', DEPS);
  assert.equal(a, b, 'same address → same token');
  assert.match(a, /^[0-9a-f]{64}$/, 'hex sha256');
});

test('token normalizes case and surrounding whitespace', () => {
  const canonical = emailLinkToken('you@example.com', DEPS);
  assert.equal(emailLinkToken('  YOU@Example.COM  ', DEPS), canonical);
});

test('verifyEmailLinkToken accepts a valid token', () => {
  const token = emailLinkToken('you@example.com', DEPS);
  assert.equal(verifyEmailLinkToken('you@example.com', token, DEPS), true);
  // Normalization applies on the verify side too.
  assert.equal(verifyEmailLinkToken('YOU@example.com', token, DEPS), true);
});

test('verifyEmailLinkToken rejects a wrong address', () => {
  const token = emailLinkToken('you@example.com', DEPS);
  assert.equal(verifyEmailLinkToken('someone@else.com', token, DEPS), false);
});

test('verifyEmailLinkToken rejects a tampered / malformed token', () => {
  assert.equal(verifyEmailLinkToken('you@example.com', 'deadbeef', DEPS), false);
  const token = emailLinkToken('you@example.com', DEPS);
  const flipped = `${token.slice(0, -1)}${token.endsWith('a') ? 'b' : 'a'}`;
  assert.equal(verifyEmailLinkToken('you@example.com', flipped, DEPS), false);
});

test('a token minted under a different secret does not verify', () => {
  const other = { env: { BETTER_AUTH_SECRET: 'a-completely-different-secret-value' } };
  const token = emailLinkToken('you@example.com', other);
  assert.equal(verifyEmailLinkToken('you@example.com', token, DEPS), false);
});

test('builders encode the email + token and round-trip through verify', () => {
  const email = 'a+b@example.com';
  const unsub = buildUnsubscribeUrl(email, DEPS);
  const prefs = buildPreferencesUrl(email, DEPS);

  assert.ok(unsub.includes('/api/email/unsubscribe?'), 'unsubscribe path');
  assert.ok(prefs.includes('/email/preferences?'), 'preferences path');
  // The `+` must be percent-escaped, not left bare (which decodes to a space).
  assert.ok(unsub.includes('a%2Bb%40example.com'), 'email query escaped');

  const parsed = new URL(unsub);
  const qpEmail = parsed.searchParams.get('email');
  const qpToken = parsed.searchParams.get('token');
  assert.ok(qpEmail && qpToken, 'both query params present');
  assert.equal(verifyEmailLinkToken(qpEmail, qpToken, DEPS), true, 'decoded params verify');
});

test('signing without a secret throws (never signs as empty)', () => {
  assert.throws(() => emailLinkToken('you@example.com', { env: {} }));
});
