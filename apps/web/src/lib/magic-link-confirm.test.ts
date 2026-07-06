/**
 * Unit tests for the magic-link `next` validator — the open-redirect guard the
 * confirm page and POST route both depend on.
 *
 * The contract: accept ONLY an absolute same-origin URL whose path is EXACTLY
 * Better Auth's magic-link verify path; reject everything else (foreign origin,
 * other path, relative/garbage/missing) so no confirm hop can be steered to an
 * attacker-chosen destination.
 *
 * Run: node --experimental-strip-types --test apps/web/src/lib/magic-link-confirm.test.ts
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { MAGIC_LINK_VERIFY_PATH, validateMagicLinkNext } from './magic-link-confirm.ts';

const ORIGIN = 'https://era.style';
const VERIFY = `${ORIGIN}${MAGIC_LINK_VERIFY_PATH}?token=SECRET_TOKEN_abc123`;

test('accepts the exact verify path on the same origin (with token query)', () => {
  assert.equal(validateMagicLinkNext(VERIFY, ORIGIN), VERIFY);
});

test('accepts the verify path with no query too', () => {
  const url = `${ORIGIN}${MAGIC_LINK_VERIFY_PATH}`;
  assert.equal(validateMagicLinkNext(url, ORIGIN), url);
});

test('rejects a foreign origin even with the exact verify path', () => {
  assert.equal(
    validateMagicLinkNext(`https://evil.example${MAGIC_LINK_VERIFY_PATH}?token=x`, ORIGIN),
    null,
  );
});

test('rejects a different scheme on the same host (no downgrade)', () => {
  assert.equal(
    validateMagicLinkNext(`http://era.style${MAGIC_LINK_VERIFY_PATH}?token=x`, ORIGIN),
    null,
  );
});

test('rejects a different path on the same origin', () => {
  assert.equal(validateMagicLinkNext(`${ORIGIN}/api/auth/other`, ORIGIN), null);
  assert.equal(validateMagicLinkNext(`${ORIGIN}/`, ORIGIN), null);
});

test('rejects a path-traversal-y prefix of the verify path', () => {
  assert.equal(
    validateMagicLinkNext(`${ORIGIN}${MAGIC_LINK_VERIFY_PATH}/../../evil`, ORIGIN),
    null,
  );
});

test('rejects relative, garbage, empty, and missing values (no open redirect)', () => {
  assert.equal(validateMagicLinkNext('/api/auth/magic-link/verify?token=x', ORIGIN), null);
  assert.equal(validateMagicLinkNext('//evil.example', ORIGIN), null);
  assert.equal(validateMagicLinkNext('not a url', ORIGIN), null);
  assert.equal(validateMagicLinkNext('', ORIGIN), null);
  assert.equal(validateMagicLinkNext(undefined, ORIGIN), null);
  assert.equal(validateMagicLinkNext(null, ORIGIN), null);
});
