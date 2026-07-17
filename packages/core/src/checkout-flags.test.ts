/**
 * Unit tests for the pure in-flow checkout feature flag.
 *
 * Mirrors the try-on flag test: only the exact string 'true' turns checkout on,
 * everything else — unset, a differently-cased 'TRUE', '1', 'yes', a stray space —
 * reads as off, so a fat-fingered flag can never half-open the payment-adjacent,
 * PII-handling surface.
 *
 * Run: node --experimental-strip-types --test src/checkout-flags.test.ts
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { isEraCheckoutEnabled } from './checkout-flags.ts';

test('isEraCheckoutEnabled is true only for the exact string "true"', () => {
  assert.equal(isEraCheckoutEnabled('true'), true);
  assert.equal(isEraCheckoutEnabled('TRUE'), false);
  assert.equal(isEraCheckoutEnabled('True'), false);
  assert.equal(isEraCheckoutEnabled('1'), false);
  assert.equal(isEraCheckoutEnabled('yes'), false);
  assert.equal(isEraCheckoutEnabled(' true '), false);
  assert.equal(isEraCheckoutEnabled(''), false);
  assert.equal(isEraCheckoutEnabled(undefined), false);
});
