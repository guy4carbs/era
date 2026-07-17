/**
 * Unit tests for the try-on chain planner and staleness signature.
 *
 * The planner ({@link planTryonChain}) is the load-bearing selection rule — which
 * of an outfit's pieces get rendered, in what order — so it is pinned table-driven
 * across the cases that matter: a dress wins outright over top+bottom, a top+bottom
 * pairing renders both, a duplicate category collapses to the lowest layerOrder
 * (with an id tiebreak), an all-accessory outfit renders nothing, and the layer
 * order is always base-first. {@link itemsSignature} is asserted to be
 * order-independent (a set, sorted) and to ignore skipped pieces so canvas
 * transforms and non-renderable additions never invalidate a paid render.
 *
 * Run: node --experimental-strip-types --test src/tryon.test.ts
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  TRYON_CATEGORIES,
  planTryonChain,
  itemsSignature,
  type TryonInputItem,
  type GarmentStep,
} from './tryon.ts';

/** Compact item builder — `layerOrder` defaults to 0 unless a case needs it. */
const item = (id: string, category: string, layerOrder = 0): TryonInputItem => ({
  id,
  category,
  layerOrder,
});

/** The category slot sequence of a planned chain — what the table cases assert against. */
const slots = (chain: readonly GarmentStep[]): string[] => chain.map((step) => step.category);

/** The item ids of a planned chain, in chain order. */
const ids = (chain: readonly GarmentStep[]): string[] => chain.map((step) => step.id);

test('TRYON_CATEGORIES is the renderable subset in layer order', () => {
  assert.deepEqual([...TRYON_CATEGORIES], ['dress', 'top', 'bottom', 'outerwear', 'shoes']);
});

// --- planTryonChain: selection + ordering table ----------------------------

const cases: ReadonlyArray<{
  name: string;
  items: TryonInputItem[];
  expectedSlots: string[];
  expectedIds: string[];
}> = [
  {
    name: 'a dress wins: top and bottom are skipped',
    items: [item('top1', 'top'), item('bot1', 'bottom'), item('dr1', 'dress')],
    expectedSlots: ['dress'],
    expectedIds: ['dr1'],
  },
  {
    name: 'a dress plus outerwear and shoes: base-first, no top/bottom',
    items: [
      item('sh1', 'shoes'),
      item('dr1', 'dress'),
      item('out1', 'outerwear'),
      item('top1', 'top'),
    ],
    expectedSlots: ['dress', 'outerwear', 'shoes'],
    expectedIds: ['dr1', 'out1', 'sh1'],
  },
  {
    name: 'top + bottom (no dress): both render, base-first',
    items: [item('bot1', 'bottom'), item('top1', 'top')],
    expectedSlots: ['top', 'bottom'],
    expectedIds: ['top1', 'bot1'],
  },
  {
    name: 'the full four-step chain: top, bottom, outerwear, shoes',
    items: [
      item('sh1', 'shoes'),
      item('out1', 'outerwear'),
      item('bot1', 'bottom'),
      item('top1', 'top'),
    ],
    expectedSlots: ['top', 'bottom', 'outerwear', 'shoes'],
    expectedIds: ['top1', 'bot1', 'out1', 'sh1'],
  },
  {
    name: 'duplicate category: lowest layerOrder wins',
    items: [item('topHi', 'top', 5), item('topLo', 'top', 1), item('bot1', 'bottom', 2)],
    expectedSlots: ['top', 'bottom'],
    expectedIds: ['topLo', 'bot1'],
  },
  {
    name: 'duplicate category with tied layerOrder: id breaks the tie',
    items: [item('topB', 'top', 3), item('topA', 'top', 3)],
    expectedSlots: ['top'],
    expectedIds: ['topA'],
  },
  {
    name: 'only a bottom (no base top, no dress): the bottom still renders',
    items: [item('bot1', 'bottom')],
    expectedSlots: ['bottom'],
    expectedIds: ['bot1'],
  },
  {
    name: 'all skipped categories: nothing renderable → empty chain',
    items: [
      item('bag1', 'bag'),
      item('hat1', 'hat'),
      item('scf1', 'scarf'),
      item('wch1', 'watch'),
      item('jwl1', 'jewelry'),
      item('acc1', 'accessory'),
    ],
    expectedSlots: [],
    expectedIds: [],
  },
  {
    name: 'empty outfit → empty chain',
    items: [],
    expectedSlots: [],
    expectedIds: [],
  },
];

test('planTryonChain selects and orders per the table', () => {
  for (const c of cases) {
    const chain = planTryonChain(c.items);
    assert.deepEqual(slots(chain), c.expectedSlots, `${c.name}: slots`);
    assert.deepEqual(ids(chain), c.expectedIds, `${c.name}: ids`);
  }
});

test('planTryonChain never exceeds four steps', () => {
  const chain = planTryonChain([
    item('top1', 'top'),
    item('bot1', 'bottom'),
    item('out1', 'outerwear'),
    item('sh1', 'shoes'),
  ]);
  assert.equal(chain.length, 4);
});

test('planTryonChain caps a dress base at three steps', () => {
  const chain = planTryonChain([
    item('dr1', 'dress'),
    item('out1', 'outerwear'),
    item('sh1', 'shoes'),
  ]);
  assert.equal(chain.length, 3);
});

test('planTryonChain is order-independent for the same outfit', () => {
  const a = planTryonChain([item('top1', 'top'), item('bot1', 'bottom'), item('sh1', 'shoes')]);
  const b = planTryonChain([item('sh1', 'shoes'), item('bot1', 'bottom'), item('top1', 'top')]);
  assert.deepEqual(a, b);
});

// --- itemsSignature: the staleness key -------------------------------------

test('itemsSignature is the sorted selected ids, colon-joined', () => {
  const sig = itemsSignature([item('top1', 'top'), item('bot1', 'bottom'), item('sh1', 'shoes')]);
  assert.equal(sig, ['bot1', 'sh1', 'top1'].sort().join(':'));
});

test('itemsSignature is deterministic regardless of input order', () => {
  const a = itemsSignature([item('a', 'top'), item('b', 'bottom'), item('c', 'shoes')]);
  const b = itemsSignature([item('c', 'shoes'), item('a', 'top'), item('b', 'bottom')]);
  assert.equal(a, b);
});

test('itemsSignature ignores skipped pieces: adding an accessory does not change it', () => {
  const base = [item('top1', 'top'), item('bot1', 'bottom')];
  const withBag = [...base, item('bag1', 'bag'), item('hat1', 'hat')];
  assert.equal(itemsSignature(base), itemsSignature(withBag));
});

test('itemsSignature reflects a dress replacing a top+bottom base', () => {
  const topBottom = itemsSignature([item('top1', 'top'), item('bot1', 'bottom')]);
  const dressed = itemsSignature([item('top1', 'top'), item('bot1', 'bottom'), item('dr1', 'dress')]);
  // The dress wins, so top/bottom drop out of the selection and the key changes.
  assert.notEqual(topBottom, dressed);
  assert.equal(dressed, 'dr1');
});

test('itemsSignature is empty for an outfit with nothing renderable', () => {
  assert.equal(itemsSignature([item('bag1', 'bag')]), '');
  assert.equal(itemsSignature([]), '');
});
