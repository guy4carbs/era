/**
 * Unit tests for the pure in-flow checkout logic — plain Node
 * (`node --experimental-strip-types --test`), no device, no React. Covers the
 * cart-count fold (sum of quantities, defensive guards), the saved-size prefill
 * selection (category → dimension → saved value, one_size never prefills), and the
 * batch-poll expiry predicate (cap boundary + non-finite clock guards).
 *
 * Run: node --experimental-strip-types --test apps/mobile/lib/checkout-logic.test.ts
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { SIZE_OPTIONS } from '@era/core/shop';
import type { ItemCategory } from '@era/core/shop';

import {
  CHECKOUT_POLL_CAP_MS,
  SIZE_OPTIONS_BY_KIND,
  cartCountFromItems,
  checkoutPollExpired,
  confirmPhaseSettled,
  offerPhaseSettled,
  prefillSizeForCategory,
  sizeOptionsForKind,
  type UserSizes,
} from './checkout-logic.ts';

// --- cartCountFromItems ------------------------------------------------------

test('cart count is empty for an empty cart', () => {
  assert.equal(cartCountFromItems([]), 0);
});

test('cart count sums quantities, not lines', () => {
  assert.equal(cartCountFromItems([{ quantity: 1 }, { quantity: 2 }, { quantity: 1 }]), 4);
});

test('cart count floors fractional and drops sub-1 / non-finite quantities', () => {
  assert.equal(
    cartCountFromItems([{ quantity: 2.9 }, { quantity: 0 }, { quantity: -3 }, { quantity: NaN }]),
    2,
  );
});

// --- prefillSizeForCategory --------------------------------------------------

const SIZES: UserSizes = { apparelSize: 'M', denimSize: '30', shoeSize: '41' };

test('apparel categories prefill the saved apparel size', () => {
  for (const category of ['top', 'dress', 'outerwear'] as const) {
    assert.equal(prefillSizeForCategory(category, SIZES), 'M');
  }
});

test('a bottom prefills the saved denim (waist) size', () => {
  assert.equal(prefillSizeForCategory('bottom', SIZES), '30');
});

test('shoes prefill the saved shoe size', () => {
  assert.equal(prefillSizeForCategory('shoes', SIZES), '41');
});

test('one-size categories never prefill', () => {
  for (const category of ['bag', 'hat', 'scarf', 'watch', 'jewelry', 'accessory'] as const) {
    assert.equal(prefillSizeForCategory(category, SIZES), null);
  }
});

test('an unset dimension prefills null even for a sized category', () => {
  const none: UserSizes = { apparelSize: null, denimSize: null, shoeSize: null };
  assert.equal(prefillSizeForCategory('top' as ItemCategory, none), null);
  assert.equal(prefillSizeForCategory('shoes', none), null);
});

// --- checkoutPollExpired -----------------------------------------------------

test('poll is not expired before the cap', () => {
  assert.equal(checkoutPollExpired(1_000, 1_000 + CHECKOUT_POLL_CAP_MS - 1), false);
});

test('poll is expired exactly at the cap', () => {
  assert.equal(checkoutPollExpired(1_000, 1_000 + CHECKOUT_POLL_CAP_MS), true);
});

test('a non-finite clock never reports expired', () => {
  assert.equal(checkoutPollExpired(NaN, 10_000), false);
  assert.equal(checkoutPollExpired(1_000, Infinity), false);
});

// --- offerPhaseSettled / confirmPhaseSettled ---------------------------------

test('offer phase is unsettled while any order is still resolving', () => {
  assert.equal(
    offerPhaseSettled([{ status: 'awaiting_confirmation' }, { status: 'retrieving_offer' }]),
    false,
  );
  assert.equal(offerPhaseSettled([{ status: 'creating' }]), false);
});

test('offer phase settles once every order has left the pre-offer beats', () => {
  assert.equal(
    offerPhaseSettled([{ status: 'awaiting_confirmation' }, { status: 'failed' }]),
    true,
  );
  assert.equal(offerPhaseSettled([{ status: 'requires_action' }]), true);
});

test('an empty batch is never settled', () => {
  assert.equal(offerPhaseSettled([]), false);
  assert.equal(confirmPhaseSettled([]), false);
});

test('confirm phase settles only when every order is terminal', () => {
  assert.equal(confirmPhaseSettled([{ status: 'completed' }, { status: 'failed' }]), true);
  assert.equal(confirmPhaseSettled([{ status: 'completed' }, { status: 'placing_order' }]), false);
  assert.equal(confirmPhaseSettled([{ status: 'expired' }]), true);
});

// --- size options -----------------------------------------------------------

test('every per-kind size option is a real core SIZE_OPTIONS value', () => {
  const core = new Set(SIZE_OPTIONS);
  for (const options of Object.values(SIZE_OPTIONS_BY_KIND)) {
    for (const size of options) {
      assert.ok(core.has(size), `${size} is not in core SIZE_OPTIONS`);
    }
  }
});

test('sizeOptionsForKind returns the kind set, and none for one_size', () => {
  assert.deepEqual(sizeOptionsForKind('apparel'), ['XS', 'S', 'M', 'L', 'XL']);
  assert.deepEqual(sizeOptionsForKind('denim'), ['24', '26', '28', '30', '32']);
  assert.deepEqual(sizeOptionsForKind('shoe'), ['37', '38', '39', '40', '41', '42']);
  assert.deepEqual(sizeOptionsForKind('one_size'), []);
});
