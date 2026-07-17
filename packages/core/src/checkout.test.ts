/**
 * Unit tests for the in-flow checkout core — the allowlist honesty control, the
 * subunit→cent money mapping, the pure cart math, and the deterministic fixture
 * provider's state machine. All $0: no network, no key, no spend.
 *
 * Run: node --experimental-strip-types --test src/checkout.test.ts
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  parseCheckoutRetailers,
  checkoutSupportFor,
  subunitsToCents,
  groupCartByRetailer,
  combineOffers,
  sizeKindForCategory,
  createFixtureCheckoutProvider,
  type CheckoutCartItem,
  type CheckoutPayment,
  type RetailerOffer,
  type SizeKind,
} from './checkout.ts';
import type { ItemCategory, ShopProduct } from './shop.ts';

// --- fixtures ----------------------------------------------------------------

/** Build a ShopProduct with sensible defaults; override what a test cares about. */
function product(partial: Partial<ShopProduct> & Pick<ShopProduct, 'id'>): ShopProduct {
  return {
    title: partial.id,
    brand: 'Test Brand',
    brandTier: 'contemporary',
    category: 'top',
    price: 100,
    currency: 'USD',
    imageUrl: `https://img.example/${partial.id}.jpg`,
    retailer: 'Fixture',
    productUrl: `https://test.example/p/${partial.id}`,
    affiliateUrl: `https://test.example/p/${partial.id}?aff=era-test`,
    colors: [],
    sizes: [],
    ...partial,
  };
}

/** Build a cart line with defaults; override what a test cares about. */
function cartItem(partial: Partial<CheckoutCartItem>): CheckoutCartItem {
  return {
    retailer: 'Fixture',
    priceSnapshotCents: 10_000,
    currency: 'USD',
    quantity: 1,
    ...partial,
  };
}

const VALID_PAYMENT: CheckoutPayment = { type: 'stripe_token', stripeToken: 'tok_visa' };

// --- parseCheckoutRetailers --------------------------------------------------

test('parseCheckoutRetailers trims, lowercases, drops empties, and de-dupes', () => {
  assert.deepEqual(parseCheckoutRetailers(' Fixture , , SSENSE ,fixture'), ['fixture', 'ssense']);
});

test('parseCheckoutRetailers on unset or blank yields an empty list', () => {
  assert.deepEqual(parseCheckoutRetailers(undefined), []);
  assert.deepEqual(parseCheckoutRetailers(''), []);
  assert.deepEqual(parseCheckoutRetailers('  ,  , '), []);
});

// --- checkoutSupportFor ------------------------------------------------------

test('checkoutSupportFor hands off when the allowlist is empty', () => {
  assert.equal(checkoutSupportFor(product({ id: 'a', retailer: 'Fixture' }), []), 'handoff');
});

test('checkoutSupportFor is in_flow for an allowlisted retailer over https', () => {
  const p = product({ id: 'a', retailer: 'SSENSE', productUrl: 'https://ssense.example/p/a' });
  assert.equal(checkoutSupportFor(p, ['ssense']), 'in_flow');
});

test('checkoutSupportFor matches the retailer case-insensitively', () => {
  const p = product({ id: 'a', retailer: 'Fixture', productUrl: 'https://x.example/a' });
  assert.equal(checkoutSupportFor(p, parseCheckoutRetailers('fixture')), 'in_flow');
});

test('checkoutSupportFor hands off an unverified retailer even over https', () => {
  const p = product({ id: 'a', retailer: 'Sketchy', productUrl: 'https://x.example/a' });
  assert.equal(checkoutSupportFor(p, ['ssense']), 'handoff');
});

test('checkoutSupportFor hands off a non-https productUrl even when allowlisted', () => {
  const p = product({ id: 'a', retailer: 'SSENSE', productUrl: 'http://ssense.example/p/a' });
  assert.equal(checkoutSupportFor(p, ['ssense']), 'handoff');
});

// --- subunitsToCents ---------------------------------------------------------

test('subunitsToCents maps a 2-decimal currency 1:1 (subunit is a cent)', () => {
  assert.equal(subunitsToCents(12_345, 'USD'), 12_345);
  assert.equal(subunitsToCents(0, 'EUR'), 0);
  assert.equal(subunitsToCents(999, 'gbp'), 999);
});

test('subunitsToCents throws for a non-integer input', () => {
  assert.throws(() => subunitsToCents(12.5, 'USD'), /integer/);
});

test('subunitsToCents throws for a non-2-decimal currency rather than mis-scale', () => {
  assert.throws(() => subunitsToCents(1000, 'JPY'), /not a 2-decimal currency/);
  assert.throws(() => subunitsToCents(1000, 'bhd'), /not a 2-decimal currency/);
});

// --- groupCartByRetailer -----------------------------------------------------

test('groupCartByRetailer groups by retailer in first-seen order with snapshot subtotals', () => {
  const groups = groupCartByRetailer([
    cartItem({ retailer: 'Fixture', priceSnapshotCents: 5_000, quantity: 2 }),
    cartItem({ retailer: 'SSENSE', priceSnapshotCents: 20_000, quantity: 1 }),
    cartItem({ retailer: 'Fixture', priceSnapshotCents: 3_000, quantity: 1 }),
  ]);
  assert.equal(groups.length, 2);
  assert.equal(groups[0]?.retailer, 'Fixture');
  assert.equal(groups[0]?.items.length, 2);
  assert.equal(groups[0]?.subtotalCents, 5_000 * 2 + 3_000); // 13,000
  assert.equal(groups[1]?.retailer, 'SSENSE');
  assert.equal(groups[1]?.subtotalCents, 20_000);
});

test('groupCartByRetailer merges retailers that differ only by case/whitespace', () => {
  const groups = groupCartByRetailer([
    cartItem({ retailer: 'Fixture' }),
    cartItem({ retailer: ' fixture ' }),
  ]);
  assert.equal(groups.length, 1);
  assert.equal(groups[0]?.items.length, 2);
  // Display retailer keeps the first-seen original casing.
  assert.equal(groups[0]?.retailer, 'Fixture');
});

test('groupCartByRetailer of an empty cart is an empty list', () => {
  assert.deepEqual(groupCartByRetailer([]), []);
});

// --- combineOffers -----------------------------------------------------------

function offer(partial: Partial<RetailerOffer> & Pick<RetailerOffer, 'retailer'>): RetailerOffer {
  return {
    subtotalCents: 10_000,
    shippingCents: 500,
    taxCents: 800,
    totalCents: 11_300,
    currency: 'USD',
    ...partial,
  };
}

test('combineOffers sums per-retailer totals into one grand total', () => {
  const combined = combineOffers([
    offer({ retailer: 'Fixture', totalCents: 11_300 }),
    offer({ retailer: 'SSENSE', totalCents: 22_600 }),
  ]);
  assert.equal(combined.perRetailer.length, 2);
  assert.equal(combined.grandTotalCents, 33_900);
  assert.equal(combined.currency, 'USD');
});

test('combineOffers of no offers is a zero total in the documented USD default', () => {
  assert.deepEqual(combineOffers([]), { perRetailer: [], grandTotalCents: 0, currency: 'USD' });
});

test('combineOffers never sums across currencies — first currency wins, mismatches excluded', () => {
  const combined = combineOffers([
    offer({ retailer: 'Fixture', currency: 'USD', totalCents: 11_300 }),
    offer({ retailer: 'Euro Store', currency: 'EUR', totalCents: 90_000 }),
  ]);
  // Every offer is still visible in perRetailer (nothing hidden)…
  assert.equal(combined.perRetailer.length, 2);
  // …but only the USD offer contributes to the grand total.
  assert.equal(combined.currency, 'USD');
  assert.equal(combined.grandTotalCents, 11_300);
});

// --- sizeKindForCategory -----------------------------------------------------

test('sizeKindForCategory maps every category to its size dimension', () => {
  const expected: Record<ItemCategory, SizeKind> = {
    top: 'apparel',
    dress: 'apparel',
    outerwear: 'apparel',
    bottom: 'denim',
    shoes: 'shoe',
    bag: 'one_size',
    hat: 'one_size',
    scarf: 'one_size',
    watch: 'one_size',
    jewelry: 'one_size',
    accessory: 'one_size',
  };
  for (const [category, kind] of Object.entries(expected)) {
    assert.equal(sizeKindForCategory(category as ItemCategory), kind, `${category} → ${kind}`);
  }
});

// --- fixture provider: supports() --------------------------------------------

test('fixture provider supports the reserved Fixture retailer in-flow, others handoff', () => {
  const provider = createFixtureCheckoutProvider();
  assert.equal(provider.name, 'fixture');
  assert.equal(provider.supports(product({ id: 'a', retailer: 'Fixture' })), 'in_flow');
  assert.equal(provider.supports(product({ id: 'b', retailer: 'FIXTURE' })), 'in_flow');
  assert.equal(provider.supports(product({ id: 'c', retailer: 'SSENSE' })), 'handoff');
});

// --- fixture provider: createIntent + deterministic offer --------------------

const buyer = {
  firstName: 'Ada',
  lastName: 'Lovelace',
  email: 'ada@example.com',
  address1: '1 Analytical Way',
  city: 'London',
  province: 'LDN',
  postalCode: 'EC1',
  country: 'GB',
} as const;

test('createIntent returns awaiting_confirmation with a deterministic offer', async () => {
  const provider = createFixtureCheckoutProvider();
  const input = { productUrl: 'https://fixture.example/p/x', quantity: 1, buyer };
  const a = await provider.createIntent(input);
  const b = await createFixtureCheckoutProvider().createIntent(input);

  assert.equal(a.state, 'awaiting_confirmation');
  assert.ok(a.offer, 'expected an offer');
  // Shipping is flat 500¢, tax is 8% of subtotal, total is their sum.
  assert.equal(a.offer?.shippingCents, 500);
  assert.equal(a.offer?.taxCents, Math.round((a.offer?.subtotalCents ?? 0) * 0.08));
  assert.equal(
    a.offer?.totalCents,
    (a.offer?.subtotalCents ?? 0) + (a.offer?.shippingCents ?? 0) + (a.offer?.taxCents ?? 0),
  );
  assert.equal(a.offer?.currency, 'USD');
  // Same URL + quantity → same offer across independent providers (deterministic).
  assert.deepEqual(a.offer, b.offer);
});

test('createIntent scales the subtotal by quantity', async () => {
  const provider = createFixtureCheckoutProvider();
  const one = await provider.createIntent({ productUrl: 'https://fixture.example/p/y', quantity: 1, buyer });
  const three = await provider.createIntent({ productUrl: 'https://fixture.example/p/y', quantity: 3, buyer });
  assert.equal(three.offer?.subtotalCents, (one.offer?.subtotalCents ?? 0) * 3);
});

// --- fixture provider: getIntent ---------------------------------------------

test('getIntent echoes the stored intent and rejects an unknown id', async () => {
  const provider = createFixtureCheckoutProvider();
  const created = await provider.createIntent({ productUrl: 'https://fixture.example/p/z', quantity: 1, buyer });
  const fetched = await provider.getIntent(created.id);
  assert.deepEqual(fetched, created);
  await assert.rejects(() => provider.getIntent('ci_nope'), /unknown intent/);
});

// --- fixture provider: confirmIntent state machine ---------------------------

test('confirmIntent transitions awaiting_confirmation → completed with a vendorOrderId', async () => {
  const provider = createFixtureCheckoutProvider();
  const created = await provider.createIntent({ productUrl: 'https://fixture.example/p/q', quantity: 1, buyer });
  const done = await provider.confirmIntent(created.id, VALID_PAYMENT);
  assert.equal(done.state, 'completed');
  assert.equal(done.vendorOrderId, `fixture_order_${created.id}`);
  assert.equal(done.failureReason, undefined);
});

test('confirmIntent from a non-awaiting state fails with invalid_state', async () => {
  const provider = createFixtureCheckoutProvider();
  const created = await provider.createIntent({ productUrl: 'https://fixture.example/p/w', quantity: 1, buyer });
  await provider.confirmIntent(created.id, VALID_PAYMENT); // → completed
  const again = await provider.confirmIntent(created.id, VALID_PAYMENT); // wrong state now
  assert.equal(again.state, 'failed');
  assert.equal(again.failureReason, 'invalid_state');
});

test('confirmIntent with a blank payment token fails with invalid_payment', async () => {
  const provider = createFixtureCheckoutProvider();
  const created = await provider.createIntent({ productUrl: 'https://fixture.example/p/e', quantity: 1, buyer });
  const failed = await provider.confirmIntent(created.id, { type: 'stripe_token', stripeToken: '  ' });
  assert.equal(failed.state, 'failed');
  assert.equal(failed.failureReason, 'invalid_payment');
});

test('confirmIntent rejects an unknown id', async () => {
  const provider = createFixtureCheckoutProvider();
  await assert.rejects(() => provider.confirmIntent('ci_nope', VALID_PAYMENT), /unknown intent/);
});
