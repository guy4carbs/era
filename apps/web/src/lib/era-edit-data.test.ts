/**
 * era-edit-data unit tests — the Your Week, Worn personalization, over a fixture
 * DB. Two `select().from().where()` calls happen per invocation (logs, then the
 * referenced items); the fake serves canned rows in that order.
 *
 * Asserts: an empty window → null (the section hides), a real window → the
 * most-worn piece by NAME with its count, cost-per-wear present only when a
 * ≥2×-worn piece has a usable price (and formatted with the item's currency),
 * and the category-word fallback when a resolved item has no usable name.
 *
 * Run: node --experimental-strip-types --test apps/web/src/lib/era-edit-data.test.ts
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { DbClient } from '@era/db';

import { getWeekWornData } from './era-edit-data.ts';

const TODAY = '2026-07-22';

interface LogRow {
  id: string;
  wornOn: string;
  outfitId: string | null;
  itemIds: string[] | null;
}
interface ItemRow {
  id: string;
  name: string;
  category: string;
  purchasePrice: string | null;
  currency: string | null;
}

/**
 * A fake Drizzle client that serves `logRows` on the first `.where()` resolution
 * and `itemRows` on the second. Each `select().from().where()` chain is awaited,
 * so a mutable cursor advances per resolved query.
 */
function fakeDb(logRows: LogRow[], itemRows: ItemRow[]): DbClient {
  const results: unknown[][] = [logRows, itemRows];
  let cursor = 0;
  const chain: Record<string, unknown> = {
    select: () => chain,
    from: () => chain,
    where: () => {
      const rows = results[cursor] ?? [];
      cursor += 1;
      return Promise.resolve(rows);
    },
  };
  return chain as unknown as DbClient;
}

test('empty window → null (Your Week, Worn hidden)', async () => {
  const data = await getWeekWornData(fakeDb([], []), 'user-1', TODAY);
  assert.equal(data, null);
});

test('logs present but referencing no items → null', async () => {
  const logs: LogRow[] = [{ id: 'l1', wornOn: '2026-07-20', outfitId: null, itemIds: [] }];
  const data = await getWeekWornData(fakeDb(logs, []), 'user-1', TODAY);
  assert.equal(data, null);
});

test('resolves the most-worn piece by name and its count', async () => {
  const logs: LogRow[] = [
    { id: 'l1', wornOn: '2026-07-18', outfitId: null, itemIds: ['shirt'] },
    { id: 'l2', wornOn: '2026-07-19', outfitId: null, itemIds: ['shirt'] },
    { id: 'l3', wornOn: '2026-07-20', outfitId: null, itemIds: ['shirt', 'trouser'] },
  ];
  const items: ItemRow[] = [
    { id: 'shirt', name: 'linen shirt', category: 'top', purchasePrice: '50.00', currency: 'USD' },
    { id: 'trouser', name: 'wide trouser', category: 'bottom', purchasePrice: null, currency: null },
  ];
  const data = await getWeekWornData(fakeDb(logs, items), 'user-1', TODAY);
  assert.ok(data);
  assert.equal(data.mostWorn.name, 'linen shirt');
  assert.equal(data.mostWorn.count, 3);
  // shirt worn 3× at $50 → $16.67/wear; the only priced ≥2× piece.
  assert.ok(data.costPerWear);
  assert.equal(data.costPerWear.name, 'linen shirt');
  assert.equal(data.costPerWear.formatted, '$16.67');
});

test('cost-per-wear is null when no ≥2×-worn piece has a usable price', async () => {
  const logs: LogRow[] = [
    { id: 'l1', wornOn: '2026-07-20', outfitId: null, itemIds: ['scarf'] },
    { id: 'l2', wornOn: '2026-07-21', outfitId: null, itemIds: ['scarf'] },
  ];
  const items: ItemRow[] = [
    { id: 'scarf', name: 'rust scarf', category: 'accessory', purchasePrice: null, currency: null },
  ];
  const data = await getWeekWornData(fakeDb(logs, items), 'user-1', TODAY);
  assert.ok(data);
  assert.equal(data.mostWorn.name, 'rust scarf');
  assert.equal(data.costPerWear, null);
});

test('falls back to the category word when an item has no usable name', async () => {
  const logs: LogRow[] = [{ id: 'l1', wornOn: '2026-07-20', outfitId: null, itemIds: ['x'] }];
  const items: ItemRow[] = [
    { id: 'x', name: '   ', category: 'top', purchasePrice: null, currency: null },
  ];
  const data = await getWeekWornData(fakeDb(logs, items), 'user-1', TODAY);
  assert.ok(data);
  // categoryLabel('top') lowercased — a real word, never a raw slug.
  assert.equal(data.mostWorn.name, 'tops');
});
