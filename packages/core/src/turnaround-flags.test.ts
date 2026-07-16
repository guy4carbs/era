/**
 * Unit tests for the pure turnaround feature flags.
 *
 * Mirrors the feed flag tests: only the exact string 'true' turns turnaround on,
 * everything else reads as off. The category parser normalizes and treats
 * unset/blank as "all categories" (null), and the per-category check honors that
 * null-means-all contract.
 *
 * Run: node --experimental-strip-types --test src/turnaround-flags.test.ts
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  isEraTurnaroundEnabled,
  enabledTurnaroundCategories,
  isTurnaroundCategoryEnabled,
} from './turnaround-flags.ts';

test('isEraTurnaroundEnabled is true only for the exact string "true"', () => {
  assert.equal(isEraTurnaroundEnabled('true'), true);
  assert.equal(isEraTurnaroundEnabled('TRUE'), false);
  assert.equal(isEraTurnaroundEnabled('True'), false);
  assert.equal(isEraTurnaroundEnabled('1'), false);
  assert.equal(isEraTurnaroundEnabled('yes'), false);
  assert.equal(isEraTurnaroundEnabled(' true '), false);
  assert.equal(isEraTurnaroundEnabled(''), false);
  assert.equal(isEraTurnaroundEnabled(undefined), false);
});

test('enabledTurnaroundCategories returns null for unset or blank (all categories)', () => {
  assert.equal(enabledTurnaroundCategories(undefined), null);
  assert.equal(enabledTurnaroundCategories(''), null);
  assert.equal(enabledTurnaroundCategories('   '), null);
  assert.equal(enabledTurnaroundCategories(',, ,'), null);
});

test('enabledTurnaroundCategories trims, lowercases, and drops empties', () => {
  const set = enabledTurnaroundCategories(' Shoes , , BAG ,outerwear ');
  assert.ok(set instanceof Set);
  assert.deepEqual([...(set as ReadonlySet<string>)].sort(), ['bag', 'outerwear', 'shoes']);
});

test('enabledTurnaroundCategories keeps a single value', () => {
  const set = enabledTurnaroundCategories('shoes');
  assert.deepEqual([...(set as ReadonlySet<string>)], ['shoes']);
});

test('isTurnaroundCategoryEnabled treats null as all-enabled', () => {
  assert.equal(isTurnaroundCategoryEnabled('shoes', null), true);
  assert.equal(isTurnaroundCategoryEnabled('anything', null), true);
});

test('isTurnaroundCategoryEnabled is set membership when a set is present', () => {
  const set = enabledTurnaroundCategories('shoes,bag') as ReadonlySet<string>;
  assert.equal(isTurnaroundCategoryEnabled('shoes', set), true);
  assert.equal(isTurnaroundCategoryEnabled('bag', set), true);
  assert.equal(isTurnaroundCategoryEnabled('outerwear', set), false);
  // The set is already lowercased; a differently-cased slug does not match.
  assert.equal(isTurnaroundCategoryEnabled('Shoes', set), false);
});
