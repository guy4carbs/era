/**
 * Unit tests for the PURE half of the share-collage pipeline — URL selection and
 * the MonthlyRecap → template-props mapping. These carry no React-Native
 * dependency (the impure `captureAndShare` lazy-imports its native modules), so
 * the module loads cleanly under the Node strip-types runner and only the pure
 * exports are exercised here. Coverage:
 *   - collageImageUrls — cover wins, tile cap, de-dupe, empty/whitespace drops
 *   - recapThumbUrls — ranking order, skips missing items + un-cutout pieces, de-dupe
 *   - recapShareModel — faithful reshape, top-N cap, empty-month flag
 *
 * Run: node --experimental-strip-types --test apps/mobile/lib/share-collage.test.ts
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { MonthlyRecap, RecapTopItem } from '@era/core/wear-stats';

import {
  MAX_COLLAGE_TILES,
  MAX_RECAP_THUMBS,
  collageImageUrls,
  recapShareModel,
  recapThumbUrls,
  type RecapShareItem,
} from './share-collage.ts';

// --- collageImageUrls -------------------------------------------------------

test('collageImageUrls returns the single cover when one is present', () => {
  assert.deepEqual(
    collageImageUrls({ coverUrl: 'https://cdn/cover.png', tileUrls: ['a', 'b', 'c'] }),
    ['https://cdn/cover.png'],
  );
});

test('collageImageUrls trims a whitespace cover and falls back to tiles', () => {
  assert.deepEqual(collageImageUrls({ coverUrl: '   ', tileUrls: ['a', 'b'] }), ['a', 'b']);
});

test('collageImageUrls caps tiles at MAX_COLLAGE_TILES', () => {
  const many = ['a', 'b', 'c', 'd', 'e', 'f'];
  const urls = collageImageUrls({ coverUrl: null, tileUrls: many });
  assert.equal(urls.length, MAX_COLLAGE_TILES);
  assert.deepEqual(urls, ['a', 'b', 'c', 'd']);
});

test('collageImageUrls drops null/empty/whitespace tiles and de-duplicates', () => {
  assert.deepEqual(
    collageImageUrls({ tileUrls: ['a', null, '  ', 'a', undefined, 'b', ''] }),
    ['a', 'b'],
  );
});

test('collageImageUrls returns nothing when there is neither cover nor a usable tile', () => {
  assert.deepEqual(collageImageUrls({ coverUrl: null, tileUrls: [null, '  '] }), []);
  assert.deepEqual(collageImageUrls({}), []);
});

// --- recapThumbUrls ---------------------------------------------------------

const items: readonly RecapShareItem[] = [
  { id: 'i1', name: 'Navy blazer', imageUrl: 'https://cdn/i1.png' },
  { id: 'i2', name: 'White tee', imageUrl: null },
  { id: 'i3', name: 'Loafers', imageUrl: 'https://cdn/i3.png' },
];

function top(itemId: string, wearCount: number): RecapTopItem {
  return { itemId, wearCount, category: 'top' };
}

test('recapThumbUrls resolves cutouts in ranking order, skipping un-cutout pieces', () => {
  const urls = recapThumbUrls([top('i1', 5), top('i2', 4), top('i3', 3)], items);
  assert.deepEqual(urls, ['https://cdn/i1.png', 'https://cdn/i3.png']);
});

test('recapThumbUrls skips ids absent from the item lookup', () => {
  const urls = recapThumbUrls([top('missing', 9), top('i3', 3)], items);
  assert.deepEqual(urls, ['https://cdn/i3.png']);
});

test('recapThumbUrls de-duplicates a shared thumbnail URL', () => {
  const shared: readonly RecapShareItem[] = [
    { id: 'a', name: 'A', imageUrl: 'https://cdn/x.png' },
    { id: 'b', name: 'B', imageUrl: 'https://cdn/x.png' },
  ];
  assert.deepEqual(recapThumbUrls([top('a', 2), top('b', 2)], shared), ['https://cdn/x.png']);
});

// --- recapShareModel --------------------------------------------------------

const fullRecap: MonthlyRecap = {
  month: '2026-07',
  daysInMonth: 31,
  totalWears: 24,
  distinctDaysWorn: 18,
  topItems: [top('i1', 6), top('i2', 5), top('i3', 4), top('i4', 3), top('i5', 2)],
  mostWornCategory: 'top',
  bestCostPerWear: { itemId: 'i1', category: 'top', wearCount: 6, costPerWear: 12.5 },
};

test('recapShareModel faithfully reshapes a full recap and caps the ranking', () => {
  const model = recapShareModel(fullRecap, 'July 2026');
  assert.equal(model.monthLabel, 'July 2026');
  assert.equal(model.isEmpty, false);
  assert.equal(model.totalWears, 24);
  assert.equal(model.distinctDaysWorn, 18);
  assert.equal(model.daysInMonth, 31);
  assert.equal(model.topItems.length, MAX_RECAP_THUMBS);
  assert.deepEqual(
    model.topItems.map((t) => t.itemId),
    ['i1', 'i2', 'i3'],
  );
  assert.equal(model.mostWornCategory, 'top');
  assert.deepEqual(model.bestCostPerWear, {
    itemId: 'i1',
    category: 'top',
    wearCount: 6,
    costPerWear: 12.5,
  });
});

test('recapShareModel flags an empty month and passes its nulls through', () => {
  const empty: MonthlyRecap = {
    month: '2026-02',
    daysInMonth: 28,
    totalWears: 0,
    distinctDaysWorn: 0,
    topItems: [],
    mostWornCategory: null,
    bestCostPerWear: null,
  };
  const model = recapShareModel(empty, 'February 2026');
  assert.equal(model.isEmpty, true);
  assert.equal(model.topItems.length, 0);
  assert.equal(model.mostWornCategory, null);
  assert.equal(model.bestCostPerWear, null);
});
