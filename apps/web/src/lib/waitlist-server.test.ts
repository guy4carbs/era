/**
 * Unit tests for the pure waitlist helpers — no live database is touched.
 *
 * Covers: referral-code format / uniqueness / absence of ambiguous characters,
 * ref sanitization (valid passes, malformed → null), and the email-normalization
 * branches (trim, lowercase, length bound, shape).
 *
 * Run: node --experimental-strip-types --test apps/web/src/lib/waitlist-server.test.ts
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { generateReferralCode, normalizeEmail, sanitizeRef } from './waitlist-server.ts';

const CODE_RE = /^[0-9A-HJKMNP-TV-Z]{8}$/;

test('generateReferralCode is 8 valid Crockford base32 chars', () => {
  for (let i = 0; i < 200; i += 1) {
    const code = generateReferralCode();
    assert.equal(code.length, 8, `expected length 8, got "${code}"`);
    assert.match(code, CODE_RE, `"${code}" is not valid Crockford base32`);
  }
});

test('generateReferralCode never emits ambiguous I/L/O/U characters', () => {
  for (let i = 0; i < 500; i += 1) {
    const code = generateReferralCode();
    assert.doesNotMatch(code, /[ILOU]/, `"${code}" contains an ambiguous char`);
  }
});

test('generateReferralCode is effectively unique across a large sample', () => {
  const seen = new Set<string>();
  for (let i = 0; i < 5000; i += 1) seen.add(generateReferralCode());
  // 5000 draws from 32^8 (~1.1e12) should collide with negligible probability.
  assert.ok(seen.size >= 4999, `too many collisions: ${5000 - seen.size}`);
});

test('sanitizeRef accepts a well-formed code and echoes it back', () => {
  const valid = generateReferralCode();
  assert.equal(sanitizeRef(valid), valid);
  assert.equal(sanitizeRef('0123456789'.slice(0, 8)), '01234567');
});

test('sanitizeRef rejects malformed refs → null', () => {
  for (const bad of [
    'ABC', // too short
    'ABCDEFGHI', // too long
    'ABCDEFGI', // contains I (ambiguous)
    'abcdefgh', // lowercase
    'ABCDE FG', // whitespace
    'ABCDEFG!', // symbol
    '',
    null,
    undefined,
    12345678,
    {},
  ]) {
    assert.equal(sanitizeRef(bad), null, `expected null for ${JSON.stringify(bad)}`);
  }
});

test('normalizeEmail trims and lowercases', () => {
  assert.equal(normalizeEmail('  User@Example.COM  '), 'user@example.com');
});

test('normalizeEmail accepts plausible addresses', () => {
  for (const ok of ['a@b.co', 'first.last@sub.domain.io', 'x+tag@mail.example.com']) {
    assert.equal(normalizeEmail(ok), ok);
  }
});

test('normalizeEmail rejects invalid addresses → null', () => {
  for (const bad of [
    'not-an-email',
    'missing@tld',
    '@no-local.com',
    'no-domain@',
    'two@@at.com',
    'has space@x.com',
    '',
    '   ',
    null,
    undefined,
    42,
  ]) {
    assert.equal(normalizeEmail(bad), null, `expected null for ${JSON.stringify(bad)}`);
  }
});

test('normalizeEmail rejects over-long addresses (> 254 chars)', () => {
  const longLocal = 'a'.repeat(250);
  assert.equal(normalizeEmail(`${longLocal}@example.com`), null);
});
