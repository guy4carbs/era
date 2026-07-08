import { test } from 'node:test';
import assert from 'node:assert/strict';

import { findWardrobeGaps } from './wardrobe-gaps.ts';
import type { OviItem, StyleProfileLite, WearLogLite } from './ovi.ts';

// --- fixtures ----------------------------------------------------------------

let seq = 0;
/** Build an owned OviItem of a category with a unique id; override as needed. */
function owned(category: string, partial: Partial<OviItem> = {}): OviItem {
  seq += 1;
  return { id: `${category}-${seq}`, category, colors: [], pattern: null, brand: null, ...partial };
}

/** N owned items of one category. */
function many(category: string, n: number): OviItem[] {
  return Array.from({ length: n }, () => owned(category));
}

const profile: StyleProfileLite = {
  archetype: 'quiet luxury',
  palette: ['black', 'camel'],
  keywords: ['elevated', 'minimal'],
};

// --- a real gap: many tops + shoes, one bottom -------------------------------

test('surfaces a genuine bottom gap with correct unlocksOutfits and pairsWith', () => {
  // 6 tops, 2 shoes, 1 bottom, 1 outerwear → only the bottom is short.
  const closet = [...many('top', 6), ...many('shoes', 2), ...many('bottom', 1), ...many('outerwear', 1)];

  const gaps = findWardrobeGaps(closet, null);

  assert.equal(gaps.length, 1, 'exactly one genuine gap');
  const gap = gaps[0]!;
  assert.equal(gap.category, 'bottom');
  assert.equal(gap.ownedCount, 1);
  // Adding one bottom pairs with each of the 6 owned tops → 6 new looks.
  assert.equal(gap.unlocksOutfits, 6);
  assert.deepEqual(gap.pairsWith, ['top']);
  assert.deepEqual(gap.suggestedQuery, { category: 'bottom' });
});

// --- a balanced closet manufactures nothing ----------------------------------

test('a balanced, well-covered closet returns no gaps', () => {
  const closet = [
    ...many('top', 4),
    ...many('bottom', 4),
    ...many('shoes', 3),
    ...many('outerwear', 2),
    ...many('dress', 1),
  ];

  const gaps = findWardrobeGaps(closet, profile);

  assert.equal(gaps.length, 0);
});

// --- a gap that unlocks zero outfits is excluded -----------------------------

test('a category that unlocks no outfits is not a gap', () => {
  // Only tops owned: shoes/outerwear would finish nothing (no anchorable look),
  // and top is not scarce. The single bottom gap is the only real one.
  const closet = many('top', 3);

  const gaps = findWardrobeGaps(closet, null);

  // Shoes own 0 but anchored looks = 0 → dropped. Outerwear likewise. Only the
  // missing bottom (scarcer than tops) unlocks anything.
  assert.deepEqual(
    gaps.map((g) => g.category),
    ['bottom'],
  );
  assert.equal(gaps[0]!.unlocksOutfits, 3);
  assert.deepEqual(gaps[0]!.pairsWith, ['top']);
});

test('an empty closet returns no gaps', () => {
  assert.deepEqual(findWardrobeGaps([], null), []);
});

// --- the cap + score ordering ------------------------------------------------

test('gaps are sorted by score descending and capped at five', () => {
  // 6 tops, 1 bottom, 0 shoes, 0 outerwear → three co-occurring gaps.
  const closet = [...many('top', 6), ...many('bottom', 1)];

  const gaps = findWardrobeGaps(closet, null);

  assert.ok(gaps.length <= 5, 'never more than five');
  assert.equal(gaps.length, 3, 'bottom, shoes, outerwear');
  // Scores are non-increasing.
  for (let i = 1; i < gaps.length; i += 1) {
    assert.ok(gaps[i - 1]!.score >= gaps[i]!.score, 'score order holds');
  }
  // With no wear data, essentials order breaks the equal-unlock tie: shoes reads
  // first (earliest essential), then bottom, then outerwear.
  assert.deepEqual(
    gaps.map((g) => g.category),
    ['shoes', 'bottom', 'outerwear'],
  );
});

// --- wear-weighting reorders equal-unlock gaps -------------------------------

test('wear patterns lift a gap in a worn slot above the essentials-order default', () => {
  // Same closet: bottom, shoes, outerwear all unlock 6. Default order leads with
  // shoes. Wear logs that favour the bottom slot should push bottom to the top.
  const closet = [...many('top', 6), ...many('bottom', 1)];
  const wornBottomId = closet.find((i) => i.category === 'bottom')!.id;
  const wearLogs: WearLogLite[] = [
    { itemIds: [wornBottomId], wornOn: '2026-07-01' },
    { itemIds: [wornBottomId], wornOn: '2026-07-02' },
    { itemIds: [wornBottomId], wornOn: '2026-07-03' },
  ];

  const withoutWear = findWardrobeGaps(closet, null);
  const withWear = findWardrobeGaps(closet, null, wearLogs);

  assert.equal(withoutWear[0]!.category, 'shoes', 'default leads with shoes');
  assert.equal(withWear[0]!.category, 'bottom', 'wear lifts the worn bottom slot first');
});

// --- suggested query carries an implied tier ---------------------------------

test('suggestedQuery carries a brand tier when the profile implies one', () => {
  const closet = [...many('top', 6), ...many('bottom', 1), ...many('shoes', 2), ...many('outerwear', 1)];

  const gap = findWardrobeGaps(closet, profile)[0]!;

  // "quiet luxury" archetype → the "luxury" signal sets a luxury tier.
  assert.deepEqual(gap.suggestedQuery, { category: 'bottom', brandTier: 'luxury' });
});
