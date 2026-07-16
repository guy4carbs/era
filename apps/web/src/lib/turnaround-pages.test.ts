/**
 * Unit tests for the pure turnaround page-order composition (web). Plain Node
 * (`node --experimental-strip-types --test`), no browser, no React — the composer
 * is data-in/data-out by design. Mirrors the mobile suite. Coverage:
 *   - empty renders → a single front page
 *   - full set → front + three_quarter + side + back in TURNAROUND_ANGLES order
 *   - out-of-order renders normalize to the frozen angle order
 *   - a missing angle is skipped (order of the rest preserved)
 *   - a render with an empty displayUrl is skipped
 *   - front always leads and carries the passed cutout URL
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { TurnaroundRender } from '@era/core/turnaround';

import { composeAnglePages } from './turnaround-pages.ts';

const FRONT = 'https://cdn.test/front.png';

function render(angle: TurnaroundRender['angle'], displayUrl = `https://cdn.test/${angle}.png`): TurnaroundRender {
  return { angle, displayUrl };
}

test('empty renders yields only the front page', () => {
  const pages = composeAnglePages(FRONT, []);
  assert.deepEqual(pages, [{ key: 'front', angle: 'front', displayUrl: FRONT }]);
});

test('full set is front then three_quarter, side, back in frozen order', () => {
  const pages = composeAnglePages(FRONT, [render('three_quarter'), render('side'), render('back')]);
  assert.deepEqual(
    pages.map((page) => page.angle),
    ['front', 'three_quarter', 'side', 'back'],
  );
});

test('out-of-order renders normalize to TURNAROUND_ANGLES order', () => {
  const pages = composeAnglePages(FRONT, [render('back'), render('three_quarter'), render('side')]);
  assert.deepEqual(
    pages.map((page) => page.angle),
    ['front', 'three_quarter', 'side', 'back'],
  );
});

test('a missing angle is skipped, remaining order preserved', () => {
  const pages = composeAnglePages(FRONT, [render('three_quarter'), render('back')]);
  assert.deepEqual(
    pages.map((page) => page.angle),
    ['front', 'three_quarter', 'back'],
  );
});

test('a render with an empty displayUrl is skipped', () => {
  const pages = composeAnglePages(FRONT, [render('three_quarter', ''), render('side')]);
  assert.deepEqual(
    pages.map((page) => page.angle),
    ['front', 'side'],
  );
});

test('front always leads and carries the passed cutout URL', () => {
  const pages = composeAnglePages(FRONT, [render('side')]);
  assert.equal(pages[0]?.angle, 'front');
  assert.equal(pages[0]?.displayUrl, FRONT);
});
