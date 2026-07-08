/**
 * Unit tests for the wardrobe-gaps server helpers — the deterministic core the
 * `POST /api/wardrobe-gaps` route and Ovi's "what am I missing?" intent delegate
 * to. No live model, no live DB: a table-keyed fake stands in for the Drizzle
 * client so `loadWardrobeGaps` runs its three owner-scoped selects, and
 * `styleWhatsMissing` is pure over a seeded closet.
 *
 * We assert: gaps surface for a closet with a genuine shortfall (more tops than
 * bottoms), the narration leads with Ovi's honest intro and gives one line per
 * gap, a covered closet returns no gaps + the warm empty line, and each gap
 * carries a `suggestedQuery` for the client's "fill this gap" action.
 *
 * Run: node --experimental-strip-types --test apps/web/src/lib/wardrobe-gaps-server.test.ts
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { OviItem, StyleProfileLite } from '@era/core/ovi';
import { strings } from '@era/core/strings';
import { type DbClient, items, styleProfiles, wearLogs } from '@era/db';

import { loadWardrobeGaps, styleWhatsMissing } from './ovi-server.ts';

/** A chain bound to a fixed row set — every terminal `.then` resolves those rows. */
function makeChain(rows: unknown[]): Record<string, unknown> {
  const chain: Record<string, unknown> = {
    where: () => chain,
    orderBy: () => chain,
    limit: () => chain,
    then: (resolve: (rows: unknown[]) => unknown, reject: (e: unknown) => unknown) =>
      Promise.resolve(rows).then(resolve, reject),
  };
  return chain;
}

/**
 * Drizzle stand-in that routes each `select().from(table)` to that table's canned
 * rows, so the three loaders in `loadWardrobeGaps` (styleProfiles / items /
 * wearLogs) each resolve independently under `Promise.all`.
 */
function fakeDb(rowsByTable: Map<unknown, unknown[]>): DbClient {
  return {
    select: () => ({
      from: (table: unknown) => makeChain(rowsByTable.get(table) ?? []),
    }),
  } as unknown as DbClient;
}

/** A closet row as `loadOviItems` selects it. */
function itemRow(id: string, category: string): Record<string, unknown> {
  return { id, category, colors: [], pattern: null, brand: null };
}

/** Three tops, one bottom, no shoes/outerwear — a genuine, unambiguous shortfall. */
const SEEDED_ITEM_ROWS = [
  itemRow('t1', 'top'),
  itemRow('t2', 'top'),
  itemRow('t3', 'top'),
  itemRow('b1', 'bottom'),
];

/** The same closet as the compact OviItem shape, for the pure narration tests. */
const SEEDED_CLOSET: OviItem[] = SEEDED_ITEM_ROWS.map((row) => ({
  id: row.id as string,
  category: row.category as string,
  colors: [],
  pattern: null,
  brand: null,
}));

test('styleWhatsMissing surfaces gaps for a closet with a shortfall and narrates them', () => {
  const { reply, gaps } = styleWhatsMissing({ items: SEEDED_CLOSET, profile: null, wearLogs: [] });

  assert.ok(gaps.length > 0, 'a top-heavy closet has genuine gaps');
  // The bottom shortfall must be one of them, and it pairs with the owned tops.
  const bottom = gaps.find((gap) => gap.category === 'bottom');
  assert.ok(bottom, 'the bottom shortfall is a gap');
  assert.ok(bottom.unlocksOutfits > 0, 'the bottom gap unlocks new outfits');

  // Ovi leads with the honest intro, then one line per gap.
  assert.ok(reply.startsWith(strings.shop.gaps.oviIntro), 'reply leads with Ovi intro');
  for (const gap of gaps) {
    assert.ok(reply.includes(strings.shop.gaps.reason(gap)), 'each gap gets its honest sentence');
  }

  // Every gap carries a pre-filtered Shop query for the client's "fill this gap" tap.
  for (const gap of gaps) {
    assert.equal(gap.suggestedQuery.category, gap.category);
  }
});

test('styleWhatsMissing returns no gaps and the warm empty line for a covered closet', () => {
  // Balanced tops/bottoms, ≥1 of each finisher → the engine manufactures nothing.
  const covered: OviItem[] = [
    { id: 't1', category: 'top', colors: [], pattern: null, brand: null },
    { id: 'b1', category: 'bottom', colors: [], pattern: null, brand: null },
    { id: 's1', category: 'shoes', colors: [], pattern: null, brand: null },
    { id: 'o1', category: 'outerwear', colors: [], pattern: null, brand: null },
  ];
  const { reply, gaps } = styleWhatsMissing({ items: covered, profile: null, wearLogs: [] });

  assert.equal(gaps.length, 0, 'a covered closet has no gaps');
  assert.equal(reply, strings.shop.gaps.empty, 'and gets the warm empty line, no nudge to buy');
});

test('loadWardrobeGaps runs the owner-scoped loaders and returns the seeded closet gaps', async () => {
  const profile: StyleProfileLite | null = null;
  const db = fakeDb(
    new Map<unknown, unknown[]>([
      [styleProfiles, []], // no quiz taken → null profile
      [items, SEEDED_ITEM_ROWS],
      [wearLogs, []],
    ]),
  );

  const gaps = await loadWardrobeGaps(db, 'owner-123');

  assert.ok(gaps.length > 0, 'the seeded shortfall yields gaps through the loaders');
  // Same result as the pure engine over the same closet — the route is a thin delegate.
  const direct = styleWhatsMissing({ items: SEEDED_CLOSET, profile, wearLogs: [] }).gaps;
  assert.deepEqual(gaps, direct, 'loadWardrobeGaps matches findWardrobeGaps on the same seed');
});
