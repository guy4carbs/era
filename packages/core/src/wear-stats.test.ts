import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  costPerWear,
  buildMonthlyRecap,
  groupWearsByDay,
  type RecapItemLike,
  type WearLogLike,
} from './wear-stats.ts';

// --- fixtures ----------------------------------------------------------------

let logSeq = 0;
/** A wear log on a given day referencing the given item ids. */
function wear(wornOn: string, itemIds: readonly string[] | null, outfitId: string | null = null): WearLogLike {
  logSeq += 1;
  return { id: `log-${logSeq}`, wornOn, outfitId, itemIds };
}

/** An owned item; category defaults to 'top', price optional. */
function item(id: string, partial: Partial<RecapItemLike> = {}): RecapItemLike {
  return { id, name: id, category: 'top', purchasePrice: null, ...partial };
}

// --- costPerWear: null cases -------------------------------------------------

test('costPerWear returns null for missing / unparseable / non-positive price', () => {
  assert.equal(costPerWear(null, 5), null);
  assert.equal(costPerWear(undefined, 5), null);
  assert.equal(costPerWear('', 5), null, 'empty string parses to 0 → null');
  assert.equal(costPerWear('   ', 5), null, 'blank string → null');
  assert.equal(costPerWear('abc', 5), null, 'garbage → null');
  assert.equal(costPerWear('0', 5), null, 'zero price → null');
  assert.equal(costPerWear('0.00', 5), null);
  assert.equal(costPerWear('-40', 5), null, 'negative price → null');
});

test('costPerWear returns null when wearCount is not a positive number', () => {
  assert.equal(costPerWear('120.00', 0), null);
  assert.equal(costPerWear('120.00', -3), null);
  assert.equal(costPerWear('120.00', Number.NaN), null);
});

// --- costPerWear: math -------------------------------------------------------

test('costPerWear divides price by wears, rounded to whole cents', () => {
  assert.equal(costPerWear('120.00', 8), 15, 'string numeric divides cleanly');
  assert.equal(costPerWear(120, 8), 15, 'number price also accepted');
  assert.equal(costPerWear('100', 3), 33.33, 'rounds 33.333… to two decimals');
  assert.equal(costPerWear('10', 3), 3.33);
  assert.equal(costPerWear('49.99', 1), 49.99, 'single wear = full price');
});

// --- recap: empty -----------------------------------------------------------

test('buildMonthlyRecap on empty logs returns zeros/nulls with correct daysInMonth', () => {
  const recap = buildMonthlyRecap([], [], '2026-02');
  assert.equal(recap.month, '2026-02');
  assert.equal(recap.daysInMonth, 28, 'Feb 2026 has 28 days');
  assert.equal(recap.totalWears, 0);
  assert.equal(recap.distinctDaysWorn, 0);
  assert.deepEqual(recap.topItems, []);
  assert.equal(recap.mostWornCategory, null);
  assert.equal(recap.bestCostPerWear, null);
});

test('buildMonthlyRecap tolerates an unparseable month string', () => {
  const recap = buildMonthlyRecap([wear('2026-03-01', ['a'])], [item('a')], 'not-a-month');
  assert.equal(recap.daysInMonth, 0);
  assert.equal(recap.totalWears, 0, 'nothing is in an unparseable month');
  assert.deepEqual(recap.topItems, []);
});

test('buildMonthlyRecap computes leap-year February length', () => {
  assert.equal(buildMonthlyRecap([], [], '2024-02').daysInMonth, 29);
  assert.equal(buildMonthlyRecap([], [], '2026-04').daysInMonth, 30);
});

// --- recap: day / wear counting ---------------------------------------------

test('buildMonthlyRecap counts wears per log and distinct days separately', () => {
  const logs = [
    wear('2026-03-01', ['a']),
    wear('2026-03-01', ['b']), // same day, second wear
    wear('2026-03-05', ['a']),
    wear('2026-02-28', ['a']), // outside the month → ignored
  ];
  const recap = buildMonthlyRecap(logs, [item('a'), item('b')], '2026-03');
  assert.equal(recap.totalWears, 3, 'three logs fall in March');
  assert.equal(recap.distinctDaysWorn, 2, 'two distinct March days');
});

// --- recap: top-items ordering + tie stability ------------------------------

test('buildMonthlyRecap ranks top items by wears, capped at five', () => {
  const logs = [
    wear('2026-03-01', ['a', 'b', 'c']),
    wear('2026-03-02', ['a', 'b']),
    wear('2026-03-03', ['a']),
    wear('2026-03-04', ['d', 'e', 'f']),
  ];
  const items = ['a', 'b', 'c', 'd', 'e', 'f'].map((id) => item(id));
  const recap = buildMonthlyRecap(logs, items, '2026-03');
  assert.equal(recap.topItems.length, 5, 'capped at five');
  assert.equal(recap.topItems[0]!.itemId, 'a');
  assert.equal(recap.topItems[0]!.wearCount, 3);
  assert.equal(recap.topItems[1]!.itemId, 'b');
  assert.equal(recap.topItems[1]!.wearCount, 2);
});

test('buildMonthlyRecap breaks equal-wear ties by first appearance (stable)', () => {
  // c, d, e, f each worn exactly once; first-seen order is c, d, e, f.
  const logs = [wear('2026-03-01', ['c', 'd']), wear('2026-03-02', ['e', 'f'])];
  const items = ['f', 'e', 'd', 'c'].map((id) => item(id)); // lookup order deliberately reversed
  const recap = buildMonthlyRecap(logs, items, '2026-03');
  assert.deepEqual(
    recap.topItems.map((t) => t.itemId),
    ['c', 'd', 'e', 'f'],
    'ties keep the order the ids first appear in the logs, not lookup order',
  );
});

test('buildMonthlyRecap resolves each top item’s category', () => {
  const logs = [wear('2026-03-01', ['shoes-1'])];
  const items = [item('shoes-1', { category: 'shoes' })];
  const recap = buildMonthlyRecap(logs, items, '2026-03');
  assert.equal(recap.topItems[0]!.category, 'shoes');
});

// --- recap: most-worn category ----------------------------------------------

test('buildMonthlyRecap picks the most-worn category', () => {
  const logs = [
    wear('2026-03-01', ['t1', 't2']), // 2 tops
    wear('2026-03-02', ['b1']), // 1 bottom
    wear('2026-03-03', ['t1']), // top again → tops lead 3-1
  ];
  const items = [
    item('t1', { category: 'top' }),
    item('t2', { category: 'top' }),
    item('b1', { category: 'bottom' }),
  ];
  const recap = buildMonthlyRecap(logs, items, '2026-03');
  assert.equal(recap.mostWornCategory, 'top');
});

// --- recap: best cost per wear ----------------------------------------------

test('buildMonthlyRecap picks the lowest CPW among items worn at least twice', () => {
  const logs = [
    wear('2026-03-01', ['cheap', 'dear']),
    wear('2026-03-02', ['cheap', 'dear']),
    wear('2026-03-03', ['cheap']), // cheap: 3 wears, dear: 2 wears
    wear('2026-03-04', ['once']), // worn once → ineligible
  ];
  const items = [
    item('cheap', { purchasePrice: '30.00' }), // 30/3 = 10
    item('dear', { purchasePrice: '40.00' }), // 40/2 = 20
    item('once', { purchasePrice: '5.00' }), // 5/1 but only 1 wear → excluded
  ];
  const recap = buildMonthlyRecap(logs, items, '2026-03');
  assert.notEqual(recap.bestCostPerWear, null);
  assert.equal(recap.bestCostPerWear!.itemId, 'cheap');
  assert.equal(recap.bestCostPerWear!.costPerWear, 10);
  assert.equal(recap.bestCostPerWear!.wearCount, 3);
});

test('buildMonthlyRecap best CPW is null when no qualifying item has a price', () => {
  const logs = [wear('2026-03-01', ['a']), wear('2026-03-02', ['a'])];
  const recap = buildMonthlyRecap(logs, [item('a', { purchasePrice: null })], '2026-03');
  assert.equal(recap.bestCostPerWear, null, 'worn twice but unpriced → no best value');
});

// --- recap: robustness to unknown ids + null itemIds ------------------------

test('buildMonthlyRecap skips wear-logged ids not in the lookup without throwing', () => {
  const logs = [
    wear('2026-03-01', ['known', 'ghost']),
    wear('2026-03-02', ['ghost']),
  ];
  const recap = buildMonthlyRecap(logs, [item('known', { category: 'bottom' })], '2026-03');
  assert.equal(recap.totalWears, 2, 'wears are still counted at the log level');
  assert.equal(
    recap.topItems.length,
    1,
    'only the resolvable item appears in the ranking',
  );
  assert.equal(recap.topItems[0]!.itemId, 'known');
  assert.equal(recap.mostWornCategory, 'bottom', 'ghost id contributes to no category');
});

test('buildMonthlyRecap tolerates logs with null itemIds', () => {
  const logs = [wear('2026-03-01', null), wear('2026-03-02', ['a'])];
  const recap = buildMonthlyRecap(logs, [item('a')], '2026-03');
  assert.equal(recap.totalWears, 2);
  assert.equal(recap.distinctDaysWorn, 2);
  assert.equal(recap.topItems.length, 1);
});

// --- groupWearsByDay ---------------------------------------------------------

test('groupWearsByDay buckets logs by wornOn, preserving order', () => {
  const l1 = wear('2026-03-01', ['a']);
  const l2 = wear('2026-03-02', ['b']);
  const l3 = wear('2026-03-01', ['c']);
  const byDay = groupWearsByDay([l1, l2, l3]);
  assert.equal(byDay.size, 2);
  assert.deepEqual(byDay.get('2026-03-01'), [l1, l3]);
  assert.deepEqual(byDay.get('2026-03-02'), [l2]);
  // First-seen day order.
  assert.deepEqual([...byDay.keys()], ['2026-03-01', '2026-03-02']);
});

test('groupWearsByDay on empty input yields an empty map', () => {
  assert.equal(groupWearsByDay([]).size, 0);
});
