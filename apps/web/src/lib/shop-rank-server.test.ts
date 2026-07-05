/**
 * Unit tests for the Shop ranking decision point — no live model, no live DB. A
 * chainable fake stands in for the Drizzle client (recording inserts, resolving
 * canned select rows). We assert the deterministic passthrough (the live path),
 * that a real key + hit rate limit DEGRADES to deterministic without a 429, and
 * that the dormant refiner meters nothing.
 *
 * Run: node --experimental-strip-types --test apps/web/src/lib/shop-rank-server.test.ts
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { rankProducts, type ShopProduct } from '@era/core/shop';
import type { OviItem, StyleProfileLite } from '@era/core/ovi';
import type { DbClient } from '@era/db';

import { rankProductsForUser } from './shop-rank-server.ts';

/** Chainable Drizzle stand-in: select-chains resolve to `selectRows`; inserts are captured. */
function fakeDb(selectRows: unknown[] = []): { db: DbClient; inserts: unknown[] } {
  const inserts: unknown[] = [];
  const chain: Record<string, unknown> = {
    select: () => chain,
    from: () => chain,
    where: () => chain,
    groupBy: () => chain,
    insert: () => chain,
    values: (v: unknown) => {
      inserts.push(v);
      return Promise.resolve();
    },
    then: (resolve: (rows: unknown[]) => unknown, reject: (e: unknown) => unknown) =>
      Promise.resolve(selectRows).then(resolve, reject),
  };
  return { db: chain as unknown as DbClient, inserts };
}

/** Restore an env var around a test body. */
async function withEnv(key: string, value: string | undefined, run: () => Promise<void>): Promise<void> {
  const saved = process.env[key];
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
  try {
    await run();
  } finally {
    if (saved === undefined) delete process.env[key];
    else process.env[key] = saved;
  }
}

const PRODUCTS: ShopProduct[] = [
  {
    id: 'p-top',
    title: 'Cotton Tee',
    brand: 'COS',
    brandTier: 'contemporary',
    category: 'top',
    price: 45,
    currency: 'USD',
    imageUrl: 'https://img.example/top.jpg',
    retailer: 'COS',
    productUrl: 'https://cos.example/p/top',
    affiliateUrl: 'https://cos.example/p/top?aff=era',
    colors: ['white'],
  },
  {
    id: 'p-shoes',
    title: 'Leather Boot',
    brand: 'Ganni',
    brandTier: 'contemporary',
    category: 'shoes',
    price: 415,
    currency: 'USD',
    imageUrl: 'https://img.example/shoes.jpg',
    retailer: 'Ganni',
    productUrl: 'https://ganni.example/p/boot',
    affiliateUrl: 'https://ganni.example/p/boot?aff=era',
    colors: ['black'],
  },
];

const CLOSET: OviItem[] = [
  { id: 'c1', category: 'bottom', colors: ['black'], pattern: null, brand: null },
  { id: 'c2', category: 'bottom', colors: ['indigo'], pattern: null, brand: null },
];
const PROFILE: StyleProfileLite = { archetype: 'minimalist', palette: ['black', 'white'], keywords: [] };

test('deterministic passthrough when no real ANTHROPIC key: same order as rankProducts, no DB writes', async () => {
  await withEnv('ANTHROPIC_API_KEY', 'change-me-anthropic-key', async () => {
    const { db, inserts } = fakeDb();
    const result = await rankProductsForUser(db, 'user-1', PRODUCTS, CLOSET, PROFILE);
    assert.equal(result.source, 'deterministic');
    // Exactly the pure ranker's output — no reordering, no dropped/added products.
    const expected = rankProducts(PRODUCTS, CLOSET, PROFILE);
    assert.deepEqual(
      result.products.map((p) => p.id),
      expected.map((p) => p.id),
    );
    assert.equal(result.products.length, PRODUCTS.length);
    assert.equal(inserts.length, 0, 'the deterministic path must never write ai_usage');
  });
});

test('deterministic ranking attaches honest whys (shoes fill the gap, top completes looks)', async () => {
  await withEnv('ANTHROPIC_API_KEY', undefined, async () => {
    const { db } = fakeDb();
    const result = await rankProductsForUser(db, 'user-1', PRODUCTS, CLOSET, PROFILE);
    const top = result.products.find((p) => p.id === 'p-top');
    const shoes = result.products.find((p) => p.id === 'p-shoes');
    assert.ok(top && shoes);
    // Closet is all bottoms → 'shoes' is the biggest essential gap
    // (ESSENTIAL_CATEGORIES = [shoes, bottom, top, outerwear]); the top completes
    // a look with each owned bottom.
    assert.equal(shoes!.why?.kind, 'fills_gap');
    assert.equal(top!.why?.kind, 'completes_outfits');
  });
});

test('real key + hit daily limit DEGRADES to deterministic (never 429), meters nothing', async () => {
  await withEnv('ANTHROPIC_API_KEY', 'sk-ant-real-key-abc123', async () => {
    // checkDailyLimit selects a `used` count at/over the rank-products ceiling (30).
    const { db, inserts } = fakeDb([{ used: 30 }]);
    const result = await rankProductsForUser(db, 'user-1', PRODUCTS, CLOSET, PROFILE);
    assert.equal(result.source, 'deterministic');
    assert.equal(result.products.length, PRODUCTS.length);
    assert.equal(inserts.length, 0, 'degraded browse must not record usage');
  });
});

test('real key + under limit but dormant refiner: still deterministic, meters nothing', async () => {
  await withEnv('ANTHROPIC_API_KEY', 'sk-ant-real-key-abc123', async () => {
    const { db, inserts } = fakeDb([{ used: 0 }]); // well under the limit
    const result = await rankProductsForUser(db, 'user-1', PRODUCTS, CLOSET, PROFILE);
    assert.equal(result.source, 'deterministic');
    assert.equal(inserts.length, 0, 'dormant refiner ran no model, so nothing is metered');
  });
});

test('real key + global kill-switch engaged: DEGRADES to deterministic, never touches the model', async () => {
  await withEnv('ANTHROPIC_API_KEY', 'sk-ant-real-key-abc123', async () => {
    await withEnv('AI_KILL_SWITCH', 'on', async () => {
      const { db, inserts } = fakeDb([{ used: 0 }]); // under the per-user limit — the brake still wins
      const result = await rankProductsForUser(db, 'user-1', PRODUCTS, CLOSET, PROFILE);
      assert.equal(result.source, 'deterministic');
      assert.equal(result.products.length, PRODUCTS.length);
      assert.equal(inserts.length, 0, 'a paused browse must not record usage');
    });
  });
});
