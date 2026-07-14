/**
 * Unit tests for the Feed wire contract — the guards and constants clients and
 * the server share. The interfaces are compile-time only (type-checked by tsc,
 * not asserted here); this file covers the runtime surface:
 *   - REPORT_REASONS       — the canonical tuple and its order
 *   - isReportReason       — narrows untrusted request input, total over garbage
 *   - FEED_PAGE_WINDOW     — the pinned page/ranking window
 *
 * Run: node --experimental-strip-types --test src/feed.test.ts
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { FEED_PAGE_WINDOW, REPORT_REASONS, isReportReason } from './feed.ts';

test('REPORT_REASONS is the canonical four-reason tuple in order', () => {
  assert.deepEqual(REPORT_REASONS, ['spam', 'inappropriate', 'impersonation', 'other']);
});

test('isReportReason accepts every canonical reason', () => {
  for (const reason of REPORT_REASONS) {
    assert.equal(isReportReason(reason), true);
  }
});

test('isReportReason rejects unknown strings and non-strings without throwing', () => {
  assert.equal(isReportReason('harassment'), false);
  assert.equal(isReportReason('SPAM'), false);
  assert.equal(isReportReason(''), false);
  assert.equal(isReportReason(null), false);
  assert.equal(isReportReason(undefined), false);
  assert.equal(isReportReason(42), false);
  assert.equal(isReportReason({ reason: 'spam' }), false);
});

test('FEED_PAGE_WINDOW is 40 — the pinned page and ranking window', () => {
  assert.equal(FEED_PAGE_WINDOW, 40);
});
