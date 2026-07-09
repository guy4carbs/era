/**
 * Unit tests for the receipt-import client decision logic (byte cap + outcome
 * selection + defensive body parse). Fully hermetic — pure functions, no DOM, no
 * network.
 *
 * Run: node --experimental-strip-types --test apps/web/src/lib/receipt-import.test.ts
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  MAX_RAW_EMAIL_BYTES,
  isEmailWithinCap,
  parseReceiptResult,
  rawEmailByteLength,
  receiptOutcome,
} from './receipt-import.ts';

test('rawEmailByteLength counts UTF-8 bytes, not characters', () => {
  assert.equal(rawEmailByteLength(''), 0);
  assert.equal(rawEmailByteLength('abc'), 3);
  // A multi-byte glyph is more bytes than chars.
  assert.equal(rawEmailByteLength('é'), 2);
  assert.equal(rawEmailByteLength('😀'), 4);
});

test('isEmailWithinCap accepts up to the cap and rejects over it', () => {
  assert.equal(isEmailWithinCap(''), true);
  assert.equal(isEmailWithinCap('a'.repeat(MAX_RAW_EMAIL_BYTES)), true);
  assert.equal(isEmailWithinCap('a'.repeat(MAX_RAW_EMAIL_BYTES + 1)), false);
});

test('receiptOutcome: any imported items → added with the count', () => {
  const outcome = receiptOutcome({
    imported: [
      { id: '1', name: 'Tee', category: 'top' },
      { id: '2', name: 'Jeans', category: 'bottom' },
    ],
    skipped: 0,
  });
  assert.deepEqual(outcome, { kind: 'added', count: 2 });
});

test('receiptOutcome: nothing imported → empty (honest zero, regardless of skipped)', () => {
  assert.deepEqual(receiptOutcome({ imported: [], skipped: 0 }), { kind: 'empty' });
  assert.deepEqual(receiptOutcome({ imported: [], skipped: 3 }), { kind: 'empty' });
});

test('parseReceiptResult narrows a well-formed body', () => {
  const parsed = parseReceiptResult({ imported: [{ id: 'a', name: 'Scarf', category: 'scarf' }], skipped: 1 });
  assert.deepEqual(parsed, { imported: [{ id: 'a', name: 'Scarf', category: 'scarf' }], skipped: 1 });
});

test('parseReceiptResult defaults a missing skipped to 0', () => {
  const parsed = parseReceiptResult({ imported: [] });
  assert.deepEqual(parsed, { imported: [], skipped: 0 });
});

test('parseReceiptResult rejects malformed bodies', () => {
  assert.equal(parseReceiptResult(null), null);
  assert.equal(parseReceiptResult({}), null);
  assert.equal(parseReceiptResult({ imported: 'nope' }), null);
  assert.equal(parseReceiptResult({ imported: [{ id: 1, name: 'x', category: 'top' }] }), null);
  assert.equal(parseReceiptResult({ imported: [{ id: 'a', name: 'x' }] }), null);
});
