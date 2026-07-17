/**
 * Unit tests for the Rye checkout client — the pure JSON↔CheckoutIntent mappers and
 * the three client calls over a MOCKED global fetch (no network, no key, no spend).
 * Pins the boundary contract: Rye's cost breakdown → integer-cent offer, its state
 * vocabulary passthrough with unknown-state → 'failed', orderId → vendorOrderId,
 * failureReason object → machine code, variantSelections map → array, and a null on
 * every failure shape (non-2xx, malformed JSON, unrecognizable body, timeout).
 *
 * Run: node --experimental-strip-types --test apps/web/src/lib/rye.test.ts
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { CheckoutBuyer, CreateCheckoutIntentInput } from '@era/core/checkout';

import { createHmac } from 'node:crypto';

import { __testables, createRyeCheckoutClient, isRyeConfigured, ryeApiBase, verifyRyeSignature } from './rye.ts';

const { mapIntent, mapOffer, createIntentBody } = __testables;

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

const createInput: CreateCheckoutIntentInput = {
  productUrl: 'https://ssense.com/p/1',
  quantity: 2,
  buyer,
  variantSelections: { size: 'M' },
  maxTotalCents: 30000,
  referenceId: 'order-1',
};

/** A complete Rye offer object with a full cost breakdown. */
function ryeOffer() {
  return {
    cost: {
      total: { currencyCode: 'USD', amountSubunits: 27500 },
      subtotal: { currencyCode: 'USD', amountSubunits: 24000 },
      shipping: { currencyCode: 'USD', amountSubunits: 1500 },
      tax: { currencyCode: 'USD', amountSubunits: 2000 },
    },
    shipping: { availableOptions: [{ id: 'std', cost: { currencyCode: 'USD', amountSubunits: 1500 } }] },
  };
}

/** Install a fake global fetch returning `body` with `status`; returns captured call args. */
function stubFetch(status: number, body: unknown): { calls: { url: string; init: RequestInit }[]; restore: () => void } {
  const original = globalThis.fetch;
  const calls: { url: string; init: RequestInit }[] = [];
  globalThis.fetch = (async (url: string | URL | Request, init: RequestInit = {}) => {
    calls.push({ url: String(url), init });
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
    } as Response;
  }) as typeof fetch;
  return { calls, restore: () => { globalThis.fetch = original; } };
}

test('mapOffer maps Rye cost breakdown to integer-cent offer (shipping/tax default 0 when absent)', () => {
  assert.deepEqual(mapOffer(ryeOffer()), {
    subtotalCents: 24000,
    shippingCents: 1500,
    taxCents: 2000,
    totalCents: 27500,
    currency: 'USD',
  });
  // Missing shipping + tax → 0; subtotal + total still required.
  assert.deepEqual(
    mapOffer({ cost: { total: { currencyCode: 'USD', amountSubunits: 500 }, subtotal: { currencyCode: 'USD', amountSubunits: 500 } } }),
    { subtotalCents: 500, shippingCents: 0, taxCents: 0, totalCents: 500, currency: 'USD' },
  );
});

test('mapOffer returns undefined for a malformed / absent cost', () => {
  assert.equal(mapOffer(undefined), undefined);
  assert.equal(mapOffer({}), undefined, 'no cost');
  assert.equal(mapOffer({ cost: { total: { currencyCode: 'USD', amountSubunits: 100 } } }), undefined, 'no subtotal');
  // A non-2-decimal currency is unsupported → subunitsToCents throws → undefined, never a wrong price.
  assert.equal(
    mapOffer({ cost: { total: { currencyCode: 'JPY', amountSubunits: 1000 }, subtotal: { currencyCode: 'JPY', amountSubunits: 1000 } } }),
    undefined,
  );
});

test('mapIntent passes a known state through and carries the offer', () => {
  const intent = mapIntent({ id: 'ci_1', state: 'awaiting_confirmation', offer: ryeOffer() });
  assert.equal(intent?.id, 'ci_1');
  assert.equal(intent?.state, 'awaiting_confirmation');
  assert.equal(intent?.offer?.totalCents, 27500);
});

test('mapIntent maps orderId → vendorOrderId and failureReason object → code', () => {
  const completed = mapIntent({ id: 'ci_1', state: 'completed', orderId: 'order_abc' });
  assert.equal(completed?.vendorOrderId, 'order_abc');
  const failed = mapIntent({ id: 'ci_1', state: 'failed', failureReason: { message: 'card declined', code: 'card_declined' } });
  assert.equal(failed?.failureReason, 'card_declined');
});

test('mapIntent fails closed on an unrecognized state, and returns null with no id', () => {
  const weird = mapIntent({ id: 'ci_1', state: 'teleporting' });
  assert.equal(weird?.state, 'failed', 'unknown state → failed (never a fake success)');
  assert.equal(mapIntent({ state: 'completed' }), null, 'no id → null');
  assert.equal(mapIntent(null), null);
  assert.equal(mapIntent('nope'), null);
});

test('createIntentBody converts variantSelections map → array and maxTotalCents → integer constraint', () => {
  const body = createIntentBody(createInput);
  assert.deepEqual(body.variantSelections, [{ label: 'size', value: 'M' }]);
  assert.deepEqual(body.constraints, { maxTotalPrice: 30000 });
  assert.equal(body.referenceId, 'order-1');
  const b = body.buyer as Record<string, string>;
  assert.equal(b.firstName, 'Ada');
  assert.equal(b.country, 'US');
  assert.equal(b.phone, '+13125550123');
});

test('createIntentBody omits optional blocks when absent', () => {
  const body = createIntentBody({ productUrl: 'https://x.com/p', quantity: 1, buyer });
  assert.equal('variantSelections' in body, false);
  assert.equal('constraints' in body, false);
  assert.equal('referenceId' in body, false);
});

test('client.createIntent POSTs to /checkout-intents and maps the response', async () => {
  const stub = stubFetch(200, { id: 'ci_9', state: 'awaiting_confirmation', offer: ryeOffer() });
  try {
    const client = createRyeCheckoutClient('rye_live_key', 'https://staging.api.rye.com/api/v1');
    const intent = await client.createIntent(createInput);
    assert.equal(intent?.id, 'ci_9');
    assert.equal(intent?.offer?.subtotalCents, 24000);
    assert.equal(stub.calls.length, 1);
    assert.equal(stub.calls[0]?.url, 'https://staging.api.rye.com/api/v1/checkout-intents');
    assert.equal(stub.calls[0]?.init.method, 'POST');
    const headers = stub.calls[0]?.init.headers as Record<string, string>;
    assert.equal(headers.Authorization, 'Bearer rye_live_key');
  } finally {
    stub.restore();
  }
});

test('client.confirmIntent POSTs the stripe token to /confirm', async () => {
  const stub = stubFetch(200, { id: 'ci_9', state: 'completed', orderId: 'order_z' });
  try {
    const client = createRyeCheckoutClient('k', 'https://api.rye.com/api/v1');
    const intent = await client.confirmIntent('ci_9', { type: 'stripe_token', stripeToken: 'tok_visa' });
    assert.equal(intent?.state, 'completed');
    assert.equal(intent?.vendorOrderId, 'order_z');
    assert.equal(stub.calls[0]?.url, 'https://api.rye.com/api/v1/checkout-intents/ci_9/confirm');
    const sent = JSON.parse(String(stub.calls[0]?.init.body));
    assert.deepEqual(sent, { paymentMethod: { type: 'stripe_token', stripeToken: 'tok_visa' } });
  } finally {
    stub.restore();
  }
});

test('client returns null on a non-2xx and on malformed JSON', async () => {
  const err = stubFetch(500, { error: 'boom' });
  try {
    const client = createRyeCheckoutClient('k', 'https://api.rye.com/api/v1');
    assert.equal(await client.getIntent('ci_1'), null);
  } finally {
    err.restore();
  }
  const bad = stubFetch(200, undefined);
  try {
    const client = createRyeCheckoutClient('k', 'https://api.rye.com/api/v1');
    assert.equal(await client.getIntent('ci_1'), null, 'unmappable body → null');
  } finally {
    bad.restore();
  }
});

test('verifyRyeSignature accepts a correct v0= HMAC and rejects a forged/missing one', () => {
  const secret = 'whsec_rye_test';
  const body = '{"type":"checkout_intent.completed","source":{"id":"ci_1"}}';
  const good = `v0=${createHmac('sha256', secret).update(body).digest('hex')}`;
  assert.equal(verifyRyeSignature(body, good, secret), true);
  assert.equal(verifyRyeSignature(body, good, 'wrong_secret'), false, 'wrong secret');
  assert.equal(verifyRyeSignature(body + 'x', good, secret), false, 'tampered body');
  assert.equal(verifyRyeSignature(body, 'v0=deadbeef', secret), false, 'length mismatch');
  assert.equal(verifyRyeSignature(body, null, secret), false, 'missing header');
});

test('isRyeConfigured / ryeApiBase honor the credential + sandbox env', () => {
  const key = process.env.RYE_API_KEY;
  const sandbox = process.env.ERA_CHECKOUT_SANDBOX;
  try {
    delete process.env.RYE_API_KEY;
    assert.equal(isRyeConfigured(), false, 'unset key → not configured');
    process.env.RYE_API_KEY = 'change-me-rye';
    assert.equal(isRyeConfigured(), false, 'placeholder → not configured');
    process.env.RYE_API_KEY = 'rye_live_xyz';
    assert.equal(isRyeConfigured(), true);

    process.env.ERA_CHECKOUT_SANDBOX = 'true';
    assert.equal(ryeApiBase(), 'https://staging.api.rye.com/api/v1');
    process.env.ERA_CHECKOUT_SANDBOX = 'false';
    assert.equal(ryeApiBase(), 'https://api.rye.com/api/v1');
  } finally {
    if (key === undefined) delete process.env.RYE_API_KEY;
    else process.env.RYE_API_KEY = key;
    if (sandbox === undefined) delete process.env.ERA_CHECKOUT_SANDBOX;
    else process.env.ERA_CHECKOUT_SANDBOX = sandbox;
  }
});
