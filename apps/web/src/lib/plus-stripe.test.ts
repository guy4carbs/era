/**
 * Unit tests for the Era+ Stripe wiring. The SDK surface is injected as a fake
 * `StripePlusClient` (the module's DI idiom), so these run with no network and no
 * real key:
 *   - stripePriceForPlan / isStripeConfigured — dormancy + plan→price mapping
 *   - getStripe                                — null while the key is a placeholder
 *   - findOrCreateStripeCustomer               — search-hit reuse, miss→create, id escaping
 *   - createPlusCheckoutSession                — session params (RC unification key, no promo codes)
 *   - createPortalSession                      — portal url passthrough
 *
 * Run: node --experimental-strip-types --test apps/web/src/lib/plus-stripe.test.ts
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  createPlusCheckoutSession,
  createPortalSession,
  fetchPlusDisplayPrices,
  findOrCreateStripeCustomer,
  getStripe,
  isStripeConfigured,
  stripePriceForPlan,
  type StripePlusClient,
} from './plus-stripe.ts';

const MONTHLY = 'price_monthly_real';
const ANNUAL = 'price_annual_real';

// The plus-stripe helpers type their env as NodeJS.ProcessEnv; cast the fixtures.
function fullEnv(over: Record<string, string | undefined> = {}): NodeJS.ProcessEnv {
  return {
    STRIPE_SECRET_KEY: 'sk_live_realkey',
    STRIPE_PRICE_ERA_PLUS_MONTHLY: MONTHLY,
    STRIPE_PRICE_ERA_PLUS_ANNUAL: ANNUAL,
    ...over,
  } as unknown as NodeJS.ProcessEnv;
}

const emptyEnv = {} as NodeJS.ProcessEnv;

/** The shape prices.retrieve resolves in these fakes. */
type FakePrice = {
  unit_amount: number | null;
  currency: string;
  recurring: { interval: 'day' | 'week' | 'month' | 'year' } | null;
};

/** A fake Stripe surface recording every call, with configurable search results. */
function fakeStripe(
  over: { searchData?: Array<{ id: string }>; prices?: Record<string, FakePrice> } = {},
) {
  const calls = {
    search: [] as Array<{ query: string; limit?: number }>,
    createCustomer: [] as Array<{ email?: string; metadata: Record<string, string> }>,
    checkout: [] as Parameters<StripePlusClient['checkout']['sessions']['create']>[0][],
    portal: [] as Array<{ customer: string; return_url: string }>,
    priceRetrieve: [] as string[],
  };
  const stripe: StripePlusClient = {
    customers: {
      search: (params) => {
        calls.search.push(params);
        return Promise.resolve({ data: over.searchData ?? [] });
      },
      create: (params) => {
        calls.createCustomer.push(params);
        return Promise.resolve({ id: 'cus_created' });
      },
    },
    checkout: {
      sessions: {
        create: (params) => {
          calls.checkout.push(params);
          return Promise.resolve({ url: 'https://checkout.stripe.com/session_abc' });
        },
      },
    },
    billingPortal: {
      sessions: {
        create: (params) => {
          calls.portal.push(params);
          return Promise.resolve({ url: 'https://billing.stripe.com/portal_abc' });
        },
      },
    },
    prices: {
      retrieve: (id) => {
        calls.priceRetrieve.push(id);
        const price = over.prices?.[id];
        return price
          ? Promise.resolve(price)
          : Promise.reject(new Error(`no such fake price: ${id}`));
      },
    },
  };
  return { stripe, calls };
}

// --- config / mapping -------------------------------------------------------

test('stripePriceForPlan maps each plan to its env var, null for placeholders', () => {
  assert.equal(stripePriceForPlan('monthly', fullEnv()), MONTHLY);
  assert.equal(stripePriceForPlan('annual', fullEnv()), ANNUAL);
  assert.equal(stripePriceForPlan('monthly', fullEnv({ STRIPE_PRICE_ERA_PLUS_MONTHLY: 'change-me-monthly' })), null);
  assert.equal(stripePriceForPlan('annual', emptyEnv), null);
});

test('isStripeConfigured needs a real key AND both real prices', () => {
  assert.equal(isStripeConfigured(fullEnv()), true);
  assert.equal(isStripeConfigured(fullEnv({ STRIPE_SECRET_KEY: 'change-me-key' })), false);
  assert.equal(isStripeConfigured(fullEnv({ STRIPE_PRICE_ERA_PLUS_MONTHLY: undefined })), false);
  assert.equal(isStripeConfigured(fullEnv({ STRIPE_PRICE_ERA_PLUS_ANNUAL: 'change-me-annual' })), false);
});

test('getStripe is null while the key is a placeholder, a client when real', () => {
  assert.equal(getStripe(fullEnv({ STRIPE_SECRET_KEY: 'change-me-key' })), null);
  assert.equal(getStripe(emptyEnv), null);
  assert.notEqual(getStripe(fullEnv()), null);
});

// --- customer resolution ----------------------------------------------------

test('findOrCreateStripeCustomer reuses a searched customer and does not create', async () => {
  const { stripe, calls } = fakeStripe({ searchData: [{ id: 'cus_existing' }] });
  const id = await findOrCreateStripeCustomer(stripe, { userId: 'user-1', email: 'a@b.co' });
  assert.equal(id, 'cus_existing');
  assert.equal(calls.createCustomer.length, 0);
  assert.match(calls.search[0]!.query, /app_user_id.*user-1/);
});

test('findOrCreateStripeCustomer creates with app_user_id metadata on a search miss', async () => {
  const { stripe, calls } = fakeStripe({ searchData: [] });
  const id = await findOrCreateStripeCustomer(stripe, { userId: 'user-1', email: 'a@b.co' });
  assert.equal(id, 'cus_created');
  assert.equal(calls.createCustomer.length, 1);
  assert.equal(calls.createCustomer[0]!.metadata.app_user_id, 'user-1');
});

test('findOrCreateStripeCustomer strips quotes from the id in the search query', async () => {
  const { stripe, calls } = fakeStripe({ searchData: [] });
  await findOrCreateStripeCustomer(stripe, { userId: "u'1\"x", email: undefined });
  assert.ok(!calls.search[0]!.query.includes("'u'1"), 'quotes must be stripped from the search literal');
  // The create still stamps the untouched id (search-string escaping is search-only).
  assert.equal(calls.createCustomer[0]!.metadata.app_user_id, "u'1\"x");
});

// --- checkout / portal sessions ---------------------------------------------

test('createPlusCheckoutSession stamps the RC unification key and forbids promo codes', async () => {
  const { stripe, calls } = fakeStripe();
  const url = await createPlusCheckoutSession(stripe, { userId: 'user-1', customerId: 'cus_1', priceId: MONTHLY });
  assert.equal(url, 'https://checkout.stripe.com/session_abc');
  const params = calls.checkout[0]!;
  assert.equal(params.mode, 'subscription');
  assert.equal(params.customer, 'cus_1');
  assert.deepEqual(params.line_items, [{ price: MONTHLY, quantity: 1 }]);
  assert.equal(params.subscription_data.metadata.app_user_id, 'user-1');
  assert.equal(params.allow_promotion_codes, false);
});

test('createPortalSession returns the portal url for the customer', async () => {
  const { stripe, calls } = fakeStripe();
  const url = await createPortalSession(stripe, 'cus_1');
  assert.equal(url, 'https://billing.stripe.com/portal_abc');
  assert.equal(calls.portal[0]!.customer, 'cus_1');
});

// --- display prices ----------------------------------------------------------

const savingsPerYear = (amount: string) => `Save ${amount} a year`;

function pricePair(monthlyCents: number, annualCents: number): Record<string, FakePrice> {
  return {
    [MONTHLY]: { unit_amount: monthlyCents, currency: 'usd', recurring: { interval: 'month' } },
    [ANNUAL]: { unit_amount: annualCents, currency: 'usd', recurring: { interval: 'year' } },
  };
}

test('fetchPlusDisplayPrices formats both plans and computes a real savings line', async () => {
  const { stripe } = fakeStripe({ prices: pricePair(699, 5988) });
  const prices = await fetchPlusDisplayPrices(stripe, {
    monthlyPriceId: MONTHLY,
    annualPriceId: ANNUAL,
    savingsPerYear,
  });
  assert.ok(prices);
  assert.equal(prices.monthly.amount, '$6.99');
  assert.equal(prices.monthly.interval, 'month');
  assert.equal(prices.annual.amount, '$59.88');
  assert.equal(prices.annual.interval, 'year');
  // 12 × $6.99 = $83.88; $83.88 − $59.88 = $24.00 — the words come from the template.
  assert.equal(prices.annual.savings, 'Save $24.00 a year');
});

test('fetchPlusDisplayPrices omits savings when annual is not genuinely cheaper', async () => {
  const { stripe } = fakeStripe({ prices: pricePair(500, 6000) });
  const prices = await fetchPlusDisplayPrices(stripe, {
    monthlyPriceId: MONTHLY,
    annualPriceId: ANNUAL,
    savingsPerYear,
  });
  assert.ok(prices);
  assert.equal(prices.annual.savings, undefined);
});

test('fetchPlusDisplayPrices returns null when a price cannot be shown honestly', async () => {
  // Metered price (no unit_amount).
  const metered = pricePair(699, 5988);
  metered[MONTHLY]!.unit_amount = null;
  // Interval mismatch: the "annual" price actually bills monthly.
  const mismatched = pricePair(699, 5988);
  mismatched[ANNUAL]!.recurring = { interval: 'month' };
  // Mixed currencies can't share one honest savings computation.
  const mixed = pricePair(699, 5988);
  mixed[ANNUAL]!.currency = 'eur';

  for (const prices of [metered, mismatched, mixed]) {
    const { stripe } = fakeStripe({ prices });
    assert.equal(
      await fetchPlusDisplayPrices(stripe, {
        monthlyPriceId: MONTHLY,
        annualPriceId: ANNUAL,
        savingsPerYear,
      }),
      null,
    );
  }
});
