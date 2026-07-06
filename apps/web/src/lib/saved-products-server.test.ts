/**
 * Unit tests for the Shop wishlist persistence helpers — no live DB. A chainable
 * fake records every query-builder call (mirroring shop-rank-server.test.ts's
 * stand-in) so we can assert the operation shape: an idempotent upsert on
 * `(user_id, product_id)`, an owner-stamped row, a scoped delete, and the
 * newest-first list mapped to the client-facing shape. The pure mappers
 * (`toSavedProductRow` / `toSavedShopProduct`) are asserted directly.
 *
 * Route auth (401/403 via requireUser + isSameOrigin) and the payload 400s
 * (parseShopProduct) are covered by @era/core's authz tests and shop-query.test.ts
 * respectively; the routes reuse those exact guards.
 *
 * Run: node --experimental-strip-types --test apps/web/src/lib/saved-products-server.test.ts
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { type ShopProduct } from '@era/core/shop';
import { type DbClient, type SavedProduct, savedProducts } from '@era/db';

import {
  listSavedProducts,
  saveProduct,
  toSavedProductRow,
  toSavedShopProduct,
  unsaveProduct,
} from './saved-products-server.ts';

/** One recorded query-builder call. */
interface Call {
  readonly m: string;
  readonly args: readonly unknown[];
}

/**
 * Chainable Drizzle stand-in: every method records its call and returns the same
 * thenable chain; awaiting the chain resolves to `selectRows` (ignored by the
 * write helpers). Mirrors the fake in shop-rank-server.test.ts.
 */
function fakeDb(selectRows: unknown[] = []): { db: DbClient; calls: Call[] } {
  const calls: Call[] = [];
  const chain: Record<string | symbol, unknown> = {
    then: (resolve: (rows: unknown[]) => unknown, reject: (e: unknown) => unknown) =>
      Promise.resolve(selectRows).then(resolve, reject),
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

const PRODUCT: ShopProduct = {
  id: 'ganni-chunky-ankle-boot',
  title: 'Chunky Ankle Boot',
  brand: 'Ganni',
  brandTier: 'contemporary',
  category: 'shoes',
  price: 415,
  currency: 'USD',
  imageUrl: 'https://images.ganni.example/ganni-chunky-ankle-boot.jpg',
  retailer: 'Ganni',
  productUrl: 'https://ganni.example/p/ganni-chunky-ankle-boot',
  affiliateUrl: 'https://ganni.example/p/ganni-chunky-ankle-boot?aff=era-ganni',
  sizes: ['38', '39', '40'],
  colors: ['black'],
};

const USER = 'user-1';

test('toSavedProductRow maps a product to an owner-stamped row (price → string snapshot)', () => {
  const row = toSavedProductRow(USER, PRODUCT);
  assert.deepEqual(row, {
    userId: USER,
    productId: 'ganni-chunky-ankle-boot',
    retailer: 'Ganni',
    title: 'Chunky Ankle Boot',
    brand: 'Ganni',
    category: 'shoes',
    imageUrl: 'https://images.ganni.example/ganni-chunky-ankle-boot.jpg',
    productUrl: 'https://ganni.example/p/ganni-chunky-ankle-boot',
    affiliateUrl: 'https://ganni.example/p/ganni-chunky-ankle-boot?aff=era-ganni',
    currency: 'USD',
    priceSnapshot: '415',
  });
});

test('toSavedShopProduct maps a row to the client shape (id = productId, price coerced, nulls kept)', () => {
  const row: SavedProduct = {
    id: 'row-uuid',
    userId: USER,
    productId: 'ganni-chunky-ankle-boot',
    retailer: 'Ganni',
    title: 'Chunky Ankle Boot',
    brand: null,
    category: null,
    imageUrl: null,
    productUrl: 'https://ganni.example/p/ganni-chunky-ankle-boot',
    affiliateUrl: 'https://ganni.example/p/ganni-chunky-ankle-boot?aff=era-ganni',
    currency: 'USD',
    priceSnapshot: '415',
    lastPriceCents: null,
    lastCheckedAt: null,
    createdAt: new Date('2026-07-05T00:00:00Z'),
  };
  assert.deepEqual(toSavedShopProduct(row), {
    id: 'ganni-chunky-ankle-boot',
    title: 'Chunky Ankle Boot',
    brand: null,
    category: null,
    price: 415,
    currency: 'USD',
    imageUrl: null,
    retailer: 'Ganni',
    productUrl: 'https://ganni.example/p/ganni-chunky-ankle-boot',
    affiliateUrl: 'https://ganni.example/p/ganni-chunky-ankle-boot?aff=era-ganni',
  });
});

test('saveProduct upserts the mapped row idempotently on (user_id, product_id)', async () => {
  const { db, calls } = fakeDb();
  await saveProduct(db, USER, PRODUCT);

  const insert = calls.find((c) => c.m === 'insert');
  assert.ok(insert, 'insert into a table');
  assert.equal(insert!.args[0], savedProducts, 'insert targets saved_products');

  const values = calls.find((c) => c.m === 'values');
  assert.ok(values, 'values captured');
  assert.deepEqual(values!.args[0], toSavedProductRow(USER, PRODUCT));

  const conflict = calls.find((c) => c.m === 'onConflictDoNothing');
  assert.ok(conflict, 'onConflictDoNothing makes the save idempotent');
  const cfg = conflict!.args[0] as { target?: unknown[] };
  assert.ok(Array.isArray(cfg.target) && cfg.target.length === 2);
  // Identity check: the conflict key is exactly (userId, productId).
  assert.equal(cfg.target![0], savedProducts.userId);
  assert.equal(cfg.target![1], savedProducts.productId);
});

test('unsaveProduct issues a scoped delete on saved_products', async () => {
  const { db, calls } = fakeDb();
  await unsaveProduct(db, USER, 'ganni-chunky-ankle-boot');

  const del = calls.find((c) => c.m === 'delete');
  assert.ok(del, 'a delete is issued');
  assert.equal(del!.args[0], savedProducts, 'delete targets saved_products');
  const where = calls.find((c) => c.m === 'where');
  assert.ok(where && where.args[0] !== undefined, 'delete is filtered (owner + product scoped)');
});

test('listSavedProducts selects owner rows newest-first and maps them to the client shape', async () => {
  const rows: SavedProduct[] = [
    {
      id: 'row-1',
      userId: USER,
      productId: 'p-newer',
      retailer: 'COS',
      title: 'Boxy Tee',
      brand: 'COS',
      category: 'top',
      imageUrl: 'https://images.cos.example/p-newer.jpg',
      productUrl: 'https://cos.example/p/p-newer',
      affiliateUrl: 'https://cos.example/p/p-newer?aff=era-cos',
      currency: 'USD',
      priceSnapshot: '45',
      lastPriceCents: null,
      lastCheckedAt: null,
      createdAt: new Date('2026-07-05T00:00:00Z'),
    },
    {
      id: 'row-2',
      userId: USER,
      productId: 'p-older',
      retailer: 'Uniqlo',
      title: 'Supima Crew',
      brand: 'Uniqlo',
      category: 'top',
      imageUrl: null,
      productUrl: 'https://uniqlo.example/p/p-older',
      affiliateUrl: 'https://uniqlo.example/p/p-older?aff=era-uniqlo',
      currency: 'USD',
      priceSnapshot: '30',
      lastPriceCents: null,
      lastCheckedAt: null,
      createdAt: new Date('2026-07-01T00:00:00Z'),
    },
  ];
  const { db, calls } = fakeDb(rows);
  const result = await listSavedProducts(db, USER);

  // Owner-scoped select, ordered newest-first (the helper asks the DB to order).
  assert.ok(calls.find((c) => c.m === 'from')?.args[0] === savedProducts);
  assert.ok(calls.find((c) => c.m === 'where'), 'select is owner-scoped');
  assert.ok(calls.find((c) => c.m === 'orderBy'), 'select is ordered');

  // Mapped shape, row order preserved.
  assert.deepEqual(
    result.map((p) => p.id),
    ['p-newer', 'p-older'],
  );
  assert.equal(result[0]!.price, 45);
  assert.equal(result[1]!.imageUrl, null);
});
