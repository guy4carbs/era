/**
 * Unit tests for the pure avatar / try-on feature flag.
 *
 * Mirrors the turnaround flag test: only the exact string 'true' turns try-on on,
 * everything else — unset, a differently-cased 'TRUE', '1', 'yes', a stray space —
 * reads as off, so a fat-fingered flag can never half-open the credit-spending,
 * photo-handling surface.
 *
 * Run: node --experimental-strip-types --test src/tryon-flags.test.ts
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { isEraTryonEnabled } from './tryon-flags.ts';

test('isEraTryonEnabled is true only for the exact string "true"', () => {
  assert.equal(isEraTryonEnabled('true'), true);
  assert.equal(isEraTryonEnabled('TRUE'), false);
  assert.equal(isEraTryonEnabled('True'), false);
  assert.equal(isEraTryonEnabled('1'), false);
  assert.equal(isEraTryonEnabled('yes'), false);
  assert.equal(isEraTryonEnabled(' true '), false);
  assert.equal(isEraTryonEnabled(''), false);
  assert.equal(isEraTryonEnabled(undefined), false);
});
