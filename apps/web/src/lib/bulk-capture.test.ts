/**
 * Unit tests for the bulk-capture client decision logic: response classification
 * across every documented status/shape, and the changed-only per-item edit diff.
 * Fully hermetic — pure functions, no DOM, no network.
 *
 * Run: node --experimental-strip-types --test apps/web/src/lib/bulk-capture.test.ts
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { batchItemEdits, classifyBatchResponse } from './bulk-capture.ts';

const item = (over: Record<string, unknown> = {}) => ({
  id: 'i1',
  name: 'Tee',
  category: 'top',
  imageUrl: 'https://example.test/i1.jpg',
  ...over,
});

test('200 with items → confirm, carrying items and the failed count', () => {
  const outcome = classifyBatchResponse(200, { items: [item(), item({ id: 'i2' })], failed: 1 });
  assert.equal(outcome.kind, 'confirm');
  if (outcome.kind === 'confirm') {
    assert.equal(outcome.items.length, 2);
    assert.equal(outcome.failed, 1);
    assert.equal(outcome.items[1]?.id, 'i2');
  }
});

test('200 empty + segmentation_unavailable → dormant', () => {
  const outcome = classifyBatchResponse(200, { items: [], failed: 0, reason: 'segmentation_unavailable' });
  assert.equal(outcome.kind, 'dormant');
});

test('200 empty + no_items_found → no_items', () => {
  const outcome = classifyBatchResponse(200, { items: [], failed: 0, reason: 'no_items_found' });
  assert.equal(outcome.kind, 'no_items');
});

test('200 empty with no reason defaults to no_items (retry guidance)', () => {
  const outcome = classifyBatchResponse(200, { items: [], failed: 0 });
  assert.equal(outcome.kind, 'no_items');
});

test('429 → daily_limit with the body message', () => {
  const outcome = classifyBatchResponse(429, { error: 'daily_limit', message: "You've added a lot today" });
  assert.equal(outcome.kind, 'daily_limit');
  if (outcome.kind === 'daily_limit') assert.equal(outcome.message, "You've added a lot today");
});

test('429 without a message → daily_limit, message null (component falls back)', () => {
  const outcome = classifyBatchResponse(429, {});
  assert.deepEqual(outcome, { kind: 'daily_limit', message: null });
});

test('503 → ai_paused', () => {
  assert.deepEqual(classifyBatchResponse(503, { retryable: true, reason: 'ai_paused' }), { kind: 'ai_paused' });
});

test('413 / 502 / 400 / 401 / 403 all fold into a generic error', () => {
  for (const status of [413, 502, 400, 401, 403, 500]) {
    assert.deepEqual(classifyBatchResponse(status, { error: 'x' }), { kind: 'error' }, `status ${status}`);
  }
});

test('200 with a malformed body degrades to error, not a throw', () => {
  assert.deepEqual(classifyBatchResponse(200, null), { kind: 'error' });
  assert.deepEqual(classifyBatchResponse(200, { items: 'nope' }), { kind: 'error' });
  assert.deepEqual(classifyBatchResponse(200, { items: [{ id: 1 }] }), { kind: 'error' });
});

test('batchItemEdits returns only changed fields', () => {
  const original = { name: 'Tee', category: 'top' };
  assert.deepEqual(batchItemEdits(original, { name: 'Tee', category: 'top' }), {});
  assert.deepEqual(batchItemEdits(original, { name: 'Linen tee', category: 'top' }), { name: 'Linen tee' });
  assert.deepEqual(batchItemEdits(original, { name: 'Tee', category: 'outerwear' }), { category: 'outerwear' });
  assert.deepEqual(batchItemEdits(original, { name: 'Linen tee', category: 'dress' }), {
    name: 'Linen tee',
    category: 'dress',
  });
});

test('batchItemEdits trims the name and drops an emptied name (NOT NULL column)', () => {
  const original = { name: 'Tee', category: 'top' };
  assert.deepEqual(batchItemEdits(original, { name: '  Linen tee  ', category: 'top' }), { name: 'Linen tee' });
  // Whitespace-only / cleared name is a no-op, never an invalid blank write.
  assert.deepEqual(batchItemEdits(original, { name: '   ', category: 'top' }), {});
  // A name that only differs by surrounding whitespace is unchanged.
  assert.deepEqual(batchItemEdits(original, { name: ' Tee ', category: 'top' }), {});
});
