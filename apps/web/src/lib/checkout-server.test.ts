/**
 * Unit tests for the checkout batch orchestration — the same chainable Proxy fakeDb
 * as turnaround-server.test.ts (records builder calls, dequeues one result set per
 * awaited query). Covers the daily cap, cart→product mapping, the create-batch claim
 * branches (minted / already_running skip / per-item vendor failure), the refresh
 * fold into a combined offer, and confirm's invalid_state guard + completed-clears-cart
 * path — all with stub providers, no network.
 *
 * Run: node --experimental-strip-types --test apps/web/src/lib/checkout-server.test.ts
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { CheckoutBuyer, CheckoutIntent, CheckoutProvider } from '@era/core/checkout';
import type { CartItem, DbClient, Order } from '@era/db';

import {
  CHECKOUT_DAILY_LIMIT,
  cartRowToShopProduct,
  checkCheckoutDailyLimit,
  confirmBatch,
  createCheckoutBatch,
  refreshBatch,
} from './checkout-server.ts';

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

const buyer: CheckoutBuyer = {
  firstName: 'Ada',
  lastName: 'Lovelace',
  email: 'ada@example.com',
  phone: '+13125550123',
  address1: '1 Analytical Way',
  city: 'Chicago',
  province: 'IL',
  postalCode: '60601',
  country: 'US',
};

function fakeCartItem(over: Partial<CartItem> = {}): CartItem {
  return {
    id: 'cart-1',
    userId: 'user-1',
    productId: 'p-1',
    retailer: 'Fixture',
    title: 'Wool Trouser',
    brand: 'The Row',
    imageUrl: 'https://img/x.png',
    productUrl: 'https://store/p/1',
    affiliateUrl: 'https://aff/p/1',
    category: 'bottom',
    priceSnapshotCents: 24000,
    currency: 'USD',
    size: 'M',
    quantity: 1,
    addedAt: new Date(),
    ...over,
  } as unknown as CartItem;
}

function fakeOrder(over: Partial<Order> = {}): Order {
  return {
    id: 'order-1',
    userId: 'user-1',
    checkoutBatchId: 'batch-1',
    provider: 'stub',
    environment: 'sandbox',
    intentId: 'ci_1',
    productId: 'p-1',
    retailer: 'Fixture',
    title: 'Wool Trouser',
    brand: 'The Row',
    imageUrl: null,
    productUrl: 'https://store/p/1',
    affiliateUrl: 'https://aff/p/1',
    category: 'bottom',
    priceSnapshotCents: 24000,
    size: 'M',
    quantity: 1,
    status: 'awaiting_confirmation',
    subtotalCents: null,
    shippingCents: null,
    taxCents: null,
    totalCents: null,
    currency: 'USD',
    vendorOrderId: null,
    failureReason: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...over,
  } as unknown as Order;
}

const offer = { subtotalCents: 24000, shippingCents: 1500, taxCents: 2000, totalCents: 27500, currency: 'USD' };

function stubProvider(over: Partial<CheckoutProvider> = {}): CheckoutProvider {
  return {
    name: 'stub',
    supports: () => 'in_flow',
    createIntent: async (): Promise<CheckoutIntent> => ({ id: 'ci_1', state: 'awaiting_confirmation', offer }),
    getIntent: async (): Promise<CheckoutIntent> => ({ id: 'ci_1', state: 'completed', offer, vendorOrderId: 'o1' }),
    confirmIntent: async (): Promise<CheckoutIntent> => ({ id: 'ci_1', state: 'completed', offer, vendorOrderId: 'o1' }),
    ...over,
  };
}

test('cartRowToShopProduct carries retailer + productUrl (what supports() reads)', () => {
  const product = cartRowToShopProduct(fakeCartItem());
  assert.equal(product.retailer, 'Fixture');
  assert.equal(product.productUrl, 'https://store/p/1');
  assert.equal(product.price, 240, 'cents → major units');
});

test('checkCheckoutDailyLimit allows under the cap and blocks at it', async () => {
  const under = fakeDb([[{ used: 3 }]]);
  assert.deepEqual(await checkCheckoutDailyLimit(under.db, 'user-1'), { allowed: true, used: 3, limit: CHECKOUT_DAILY_LIMIT });
  const at = fakeDb([[{ used: CHECKOUT_DAILY_LIMIT }]]);
  const decision = await checkCheckoutDailyLimit(at.db, 'user-1');
  assert.equal(decision.allowed, false);
});

test('createCheckoutBatch mints a claim, creates an intent, persists it', async () => {
  // #1 claim insert → [{id}], #2 update → []
  const { db, calls } = fakeDb([[{ id: 'order-9' }], []]);
  const result = await createCheckoutBatch('user-1', [fakeCartItem()], buyer, stubProvider(), db);
  assert.equal(result.orders.length, 1);
  assert.equal(result.orders[0]?.orderId, 'order-9');
  assert.equal(result.orders[0]?.status, 'awaiting_confirmation');
  assert.ok(calls.some((c) => c.m === 'insert'), 'inserted a claim row');
  assert.ok(calls.some((c) => c.m === 'update'), 'persisted the intent');
});

test('createCheckoutBatch skips a claim that conflicts (already_running)', async () => {
  // Claim insert returns [] → conflict on the active double-submit index.
  const { db, calls } = fakeDb([[]]);
  let created = false;
  const provider = stubProvider({ createIntent: async () => { created = true; return { id: 'ci', state: 'awaiting_confirmation' }; } });
  const result = await createCheckoutBatch('user-1', [fakeCartItem()], buyer, provider, db);
  assert.equal(result.orders[0]?.note, 'already_running');
  assert.equal(result.orders[0]?.orderId, undefined);
  assert.equal(created, false, 'no intent created for a skipped claim');
  assert.equal(calls.filter((c) => c.m === 'update').length, 0, 'nothing to persist');
});

test('createCheckoutBatch fails one row on a vendor error and keeps going', async () => {
  // #1 claim → [{id}], #2 the failure-update → []
  const { db } = fakeDb([[{ id: 'order-9' }], []]);
  const provider = stubProvider({ createIntent: async () => { throw new Error('boom'); } });
  const result = await createCheckoutBatch('user-1', [fakeCartItem()], buyer, provider, db);
  assert.equal(result.orders[0]?.status, 'failed');
  assert.equal(result.orders[0]?.orderId, 'order-9');
});

test('refreshBatch returns null when the user owns no members', async () => {
  const { db } = fakeDb([[]]);
  assert.equal(await refreshBatch('user-1', 'batch-x', stubProvider(), db), null);
});

test('refreshBatch re-fetches non-terminal members and folds a combined offer', async () => {
  // #1 load members → [awaiting], #2 update → [], #3 reload → [completed w/ offer]
  const settled = fakeOrder({ status: 'completed', subtotalCents: 24000, shippingCents: 1500, taxCents: 2000, totalCents: 27500 });
  const { db } = fakeDb([[fakeOrder()], [], [settled]]);
  const view = await refreshBatch('user-1', 'batch-1', stubProvider(), db);
  assert.ok(view);
  assert.equal(view?.orders.length, 1);
  assert.equal(view?.combined.grandTotalCents, 27500);
  assert.equal(view?.combined.perRetailer[0]?.retailer, 'Fixture');
});

test('confirmBatch refuses when a member is not awaiting_confirmation', async () => {
  const { db } = fakeDb([[fakeOrder({ status: 'creating' })]]);
  const result = await confirmBatch('user-1', 'batch-1', stubProvider(), db);
  assert.equal(result.ok, false);
  if (!result.ok && result.code === 'invalid_state') {
    assert.equal(result.orders[0]?.status, 'creating');
  } else {
    assert.fail('expected invalid_state');
  }
});

test('confirmBatch 404s an empty/foreign batch', async () => {
  const { db } = fakeDb([[]]);
  const result = await confirmBatch('user-1', 'batch-x', stubProvider(), db);
  assert.equal(result.ok, false);
  assert.equal(result.ok === false && result.code, 'not_found');
});

test('confirmBatch confirms sequentially and clears the cart for a completed order', async () => {
  // #1 load → [awaiting], #2 update(confirm) → [], #3 delete cart → [], #4 reload → [completed]
  const settled = fakeOrder({ status: 'completed', vendorOrderId: 'o1' });
  const { db, calls } = fakeDb([[fakeOrder()], [], [], [settled]]);
  const result = await confirmBatch('user-1', 'batch-1', stubProvider(), db);
  assert.equal(result.ok, true);
  assert.ok(calls.some((c) => c.m === 'delete'), 'cleared the completed order from the cart');
  if (result.ok) {
    assert.equal(result.orders[0]?.status, 'completed');
  }
});
