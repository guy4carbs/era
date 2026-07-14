/**
 * Unit tests for shop-similar assembly — no live DB. The chainable Proxy fake (as
 * in follows-server.test.ts) feeds the three reads (posted items, viewer closet,
 * viewer privacy) in order; a StorageClient stub resolves item cutouts on the
 * public path so the matched item's display URL is deterministic.
 *
 * Coverage: the deterministic match is surfaced with the VIEWER's item name + a
 * resolved display URL; the posted item is echoed as {category, colors}; an empty
 * closet yields empty matches (no throw); an era subject reads DISTINCT items.
 *
 * Run: node --experimental-strip-types --test apps/web/src/lib/shop-similar-server.test.ts
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { type StorageClient } from '@era/core';
import { type DbClient } from '@era/db';

import { loadShopSimilar } from './shop-similar-server.ts';

interface Call {
  readonly m: string;
  readonly args: readonly unknown[];
}

function fakeDb(resultSets: unknown[][] = []): { db: DbClient; calls: Call[] } {
  const calls: Call[] = [];
  const queue = [...resultSets];
  const chain: Record<string | symbol, unknown> = {
    then: (resolve: (rows: unknown[]) => unknown, reject: (e: unknown) => unknown) => {
      const rows = queue.length > 0 ? (queue.shift() as unknown[]) : [];
      return Promise.resolve(rows).then(resolve, reject);
    },
  };
  const handler: ProxyHandler<Record<string | symbol, unknown>> = {
    get(target, prop) {
      if (prop === 'then') {
        return target.then;
      }
      return (...args: unknown[]) => {
        calls.push({ m: String(prop), args });
        return proxy;
      };
    },
  };
  const proxy = new Proxy(chain, handler);
  return { db: proxy as unknown as DbClient, calls };
}

const CDN = 'https://cdn.test';
const storage = {
  config: { publicUrls: { 'items-cutout': `${CDN}/items`, 'outfit-covers': `${CDN}/covers` } },
} as unknown as StorageClient;

test('loadShopSimilar matches the posted look to the viewer closet with a resolved cutout URL', async () => {
  const posted = [{ id: 'posted-top', category: 'top', colors: ['black'], pattern: null, brand: null }];
  const closet = [
    {
      id: 'v-top',
      category: 'top',
      colors: ['black'],
      pattern: null,
      brand: null,
      name: 'My Tee',
      imageCutoutPath: 'viewer/tee.png',
      imageRawPath: null,
    },
  ];
  const { db } = fakeDb([
    posted, // 1) posted outfit items
    closet, // 2) viewer closet (ovi slice + asset map)
    [{ isPrivate: false }], // 3) viewer privacy → public cutout URL
  ]);

  const slots = await loadShopSimilar(db, storage, 'viewer', { outfitId: 'o1', eraId: null });
  assert.equal(slots.length, 1, 'one slot for the single posted item');

  const slot = slots[0]!;
  assert.equal(slot.slot, 'base', 'a top anchors the base slot');
  assert.deepEqual(slot.posted, { category: 'top', colors: ['black'] });
  assert.equal(slot.matches.length, 1);

  const match = slot.matches[0]!;
  assert.equal(match.itemId, 'v-top');
  assert.equal(match.name, 'My Tee', 'the viewer item name comes from the closet asset map');
  assert.equal(match.category, 'top');
  assert.equal(match.score, 5, 'same category (+3) + shared color black (+2)');
  assert.deepEqual(match.reasons, ['same category', 'shares color: black']);
  assert.equal(match.imageUrl, `${CDN}/items/viewer/tee.png`, 'the viewer cutout resolves on the public path');
});

test('loadShopSimilar returns slots with empty matches for an empty closet (no throw)', async () => {
  const posted = [{ id: 'posted-top', category: 'top', colors: ['black'], pattern: null, brand: null }];
  const { db } = fakeDb([
    posted, // posted items
    [], // empty closet
    [{ isPrivate: true }], // privacy
  ]);
  const slots = await loadShopSimilar(db, storage, 'viewer', { outfitId: 'o1', eraId: null });
  assert.equal(slots.length, 1);
  assert.deepEqual(slots[0]!.matches, [], 'nothing owned scores in the slot → empty matches');
});

test('loadShopSimilar reads DISTINCT items for an era subject', async () => {
  const { db, calls } = fakeDb([
    [{ id: 'posted-top', category: 'top', colors: [], pattern: null, brand: null }],
    [],
    [{ isPrivate: true }],
  ]);
  await loadShopSimilar(db, storage, 'viewer', { outfitId: null, eraId: 'e1' });
  assert.ok(calls.find((c) => c.m === 'selectDistinct'), 'an era post unions its outfits\' items with selectDistinct');
});
