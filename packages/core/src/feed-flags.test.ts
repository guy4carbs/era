/**
 * Unit tests for the pure feed feature flag.
 *
 * Mirrors the Era+ flag tests: only the exact string 'true' turns the feed on,
 * everything else (unset, casing, truthy-looking variants) reads as off, so a
 * fat-fingered flag can never half-open the surface.
 *
 * Run: node --experimental-strip-types --test src/feed-flags.test.ts
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { isEraFeedEnabled } from './feed-flags.ts';

test('isEraFeedEnabled is true only for the exact string "true"', () => {
  assert.equal(isEraFeedEnabled('true'), true);
  assert.equal(isEraFeedEnabled('TRUE'), false);
  assert.equal(isEraFeedEnabled('True'), false);
  assert.equal(isEraFeedEnabled('1'), false);
  assert.equal(isEraFeedEnabled('yes'), false);
  assert.equal(isEraFeedEnabled(' true '), false);
  assert.equal(isEraFeedEnabled(''), false);
  assert.equal(isEraFeedEnabled(undefined), false);
});
