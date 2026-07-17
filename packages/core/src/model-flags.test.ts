/**
 * Unit tests for A/B variant selection (model-flags.ts).
 *
 * The safe default is always the baseline; only the exact string 'candidate' routes to
 * the candidate. Same exact-string discipline as the boolean feature flags.
 *
 * Run: node --experimental-strip-types --test src/model-flags.test.ts
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { parseModelVariant } from './model-flags.ts';

test("exactly 'candidate' selects the candidate", () => {
  assert.equal(parseModelVariant('candidate'), 'candidate');
});

test('unset (undefined) is baseline — the safe default', () => {
  assert.equal(parseModelVariant(undefined), 'baseline');
});

test('empty and blank strings are baseline', () => {
  assert.equal(parseModelVariant(''), 'baseline');
  assert.equal(parseModelVariant('   '), 'baseline');
});

test('near-misses do not half-route onto the candidate', () => {
  for (const raw of ['Candidate', 'CANDIDATE', 'candidate ', ' candidate', 'true', '1', 'yes', 'baseline']) {
    assert.equal(parseModelVariant(raw), 'baseline', `"${raw}" must read as baseline`);
  }
});
