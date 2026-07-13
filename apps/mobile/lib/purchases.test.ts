/**
 * Unit tests for the Era+ RevenueCat wrapper. The native module is injected as a
 * fake through the module's DI seam (`createPurchases`), so these run in plain
 * Node with no native build and no real key — exactly the Expo Go / dormant
 * runtime the wrapper is designed to survive. Coverage:
 *   - isRealCredential / computePurchasesConfigured — placeholder + flag guards
 *   - dormancy — every wrapper returns its typed `'dormant'` result, never throws,
 *     and never touches the native module, when unconfigured or in a JS-only runtime
 *   - configure — lazy, and exactly once across repeated calls
 *   - getPlusOfferings — plan mapping, missing-offering + thrown-fetch → 'error'
 *   - purchase / restore / entitlement — customerInfo → isPlus, cancel vs error
 *   - logIn / logOut binding — binds the passed user, unbinds only after configure
 *
 * Run: node --experimental-strip-types --test apps/mobile/lib/purchases.test.ts
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  computePurchasesConfigured,
  createPurchases,
  getPlusEntitlement,
  getPlusOfferings,
  isRealCredential,
  logInPurchaser,
  logOutPurchaser,
  purchasePlusPlan,
  restorePlusPurchases,
  type PlusPlan,
  type PurchasesDeps,
  type RcCustomerInfo,
  type RcOfferings,
  type RcPackage,
  type RevenueCatModule,
} from './purchases.ts';

// The store product identifiers the wrapper matches offerings against.
const MONTHLY_PRODUCT_ID = 'era_plus_monthly';
const ANNUAL_PRODUCT_ID = 'era_plus_annual';

// --- fixtures ---------------------------------------------------------------

/** A customerInfo carrying (or not) the active `plus` entitlement. */
function customerInfo(hasPlus: boolean): RcCustomerInfo {
  return {
    entitlements: { active: hasPlus ? { plus: { identifier: 'plus' } } : {} },
  };
}

function makePackage(productId: string, priceString: string): RcPackage {
  return { identifier: `${productId}:pkg`, product: { identifier: productId, priceString } };
}

function offeringWith(...packages: RcPackage[]): RcOfferings {
  return { current: { availablePackages: packages } };
}

const MONTHLY_PKG = makePackage(MONTHLY_PRODUCT_ID, '$4.99');
const ANNUAL_PKG = makePackage(ANNUAL_PRODUCT_ID, '$39.99');

const monthlyPlan: PlusPlan = { period: 'monthly', priceString: '$4.99', pkg: MONTHLY_PKG };

/**
 * A fake `react-native-purchases` recording every call, with configurable
 * results/errors per method. Typed as the real module so a signature drift breaks
 * the test, not production.
 */
function fakeRc(
  over: {
    offerings?: RcOfferings;
    offeringsError?: boolean;
    customerInfo?: RcCustomerInfo;
    customerInfoError?: boolean;
    purchaseInfo?: RcCustomerInfo;
    purchaseError?: unknown;
    restoreInfo?: RcCustomerInfo;
    restoreError?: boolean;
    logInError?: boolean;
    logOutError?: boolean;
  } = {},
) {
  const calls = {
    configure: [] as string[],
    logIn: [] as string[],
    logOut: 0,
    getOfferings: 0,
    getCustomerInfo: 0,
    purchase: [] as RcPackage[],
    restore: 0,
  };
  const mod: RevenueCatModule = {
    configure: (options) => {
      calls.configure.push(options.apiKey);
    },
    logIn: (appUserID) => {
      calls.logIn.push(appUserID);
      return over.logInError
        ? Promise.reject(new Error('logIn failed'))
        : Promise.resolve({ customerInfo: customerInfo(false), created: false });
    },
    logOut: () => {
      calls.logOut += 1;
      return over.logOutError
        ? Promise.reject(new Error('logOut failed'))
        : Promise.resolve(customerInfo(false));
    },
    getOfferings: () => {
      calls.getOfferings += 1;
      return over.offeringsError
        ? Promise.reject(new Error('offerings failed'))
        : Promise.resolve(over.offerings ?? { current: null });
    },
    getCustomerInfo: () => {
      calls.getCustomerInfo += 1;
      return over.customerInfoError
        ? Promise.reject(new Error('customerInfo failed'))
        : Promise.resolve(over.customerInfo ?? customerInfo(false));
    },
    purchasePackage: (pkg) => {
      calls.purchase.push(pkg);
      return over.purchaseError !== undefined
        ? Promise.reject(over.purchaseError)
        : Promise.resolve({ customerInfo: over.purchaseInfo ?? customerInfo(true) });
    },
    restorePurchases: () => {
      calls.restore += 1;
      return over.restoreError
        ? Promise.reject(new Error('restore failed'))
        : Promise.resolve(over.restoreInfo ?? customerInfo(true));
    },
  };
  return { mod, calls };
}

/** Build a wrapper over a fake native module, configured (a real key present) by default. */
function withRc(over: Parameters<typeof fakeRc>[0] = {}, deps: Partial<PurchasesDeps> = {}) {
  const rc = fakeRc(over);
  const api = createPurchases({
    configured: deps.configured ?? true,
    apiKey: deps.apiKey ?? 'appl_realkey',
    load: deps.load ?? (() => rc.mod),
  });
  return { api, calls: rc.calls };
}

// --- pure guards ------------------------------------------------------------

test('isRealCredential rejects undefined, empty, and change-me placeholders', () => {
  assert.equal(isRealCredential(undefined), false);
  assert.equal(isRealCredential(''), false);
  assert.equal(isRealCredential('change-me-revenuecat-ios-key'), false);
  assert.equal(isRealCredential('appl_realpublicsdkkey'), true);
});

test('computePurchasesConfigured is false when the Era+ flag is off', () => {
  assert.equal(
    computePurchasesConfigured({
      EXPO_PUBLIC_ERA_PLUS_ENABLED: 'false',
      EXPO_PUBLIC_REVENUECAT_IOS_KEY: 'appl_realpublicsdkkey',
    }),
    false,
  );
});

test('computePurchasesConfigured is false when the key is a change-me placeholder', () => {
  assert.equal(
    computePurchasesConfigured({
      EXPO_PUBLIC_ERA_PLUS_ENABLED: 'true',
      EXPO_PUBLIC_REVENUECAT_IOS_KEY: 'change-me-revenuecat-ios-key',
    }),
    false,
  );
  // Flag on but key missing entirely — still dormant.
  assert.equal(computePurchasesConfigured({ EXPO_PUBLIC_ERA_PLUS_ENABLED: 'true' }), false);
});

test('computePurchasesConfigured is true only with the flag on AND a real key', () => {
  assert.equal(
    computePurchasesConfigured({
      EXPO_PUBLIC_ERA_PLUS_ENABLED: 'true',
      EXPO_PUBLIC_REVENUECAT_IOS_KEY: 'appl_realpublicsdkkey',
    }),
    true,
  );
});

// --- dormancy: unconfigured never touches native ----------------------------

test('every wrapper is a typed no-op and never loads native when unconfigured', async () => {
  let loadCalls = 0;
  const api = createPurchases({
    configured: false,
    apiKey: 'appl_realkey',
    load: () => {
      loadCalls += 1;
      return null;
    },
  });

  assert.deepEqual(await api.getPlusOfferings(), { status: 'dormant' });
  assert.deepEqual(await api.purchasePlusPlan(monthlyPlan), { status: 'dormant' });
  assert.deepEqual(await api.restorePlusPurchases(), { status: 'dormant' });
  assert.deepEqual(await api.getPlusEntitlement(), { status: 'dormant' });
  await api.logInPurchaser('user-1'); // resolves, no throw
  await api.logOutPurchaser(); // resolves, no throw

  assert.equal(loadCalls, 0, 'the native module must never be loaded while dormant');
});

test('the default (test-env) instance is dormant — Expo Go safety net', async () => {
  // The test process has neither the flag nor a real key, so the production-wired
  // exports must resolve dormant rather than reach for the native module.
  assert.deepEqual(await getPlusOfferings(), { status: 'dormant' });
  assert.deepEqual(await purchasePlusPlan(monthlyPlan), { status: 'dormant' });
  assert.deepEqual(await restorePlusPurchases(), { status: 'dormant' });
  assert.deepEqual(await getPlusEntitlement(), { status: 'dormant' });
  await logInPurchaser('user-1');
  await logOutPurchaser();
});

test('configured but native module absent (Expo Go) stays dormant, never throws', async () => {
  const api = createPurchases({ configured: true, apiKey: 'appl_realkey', load: () => null });
  assert.deepEqual(await api.getPlusOfferings(), { status: 'dormant' });
  assert.deepEqual(await api.purchasePlusPlan(monthlyPlan), { status: 'dormant' });
  assert.deepEqual(await api.restorePlusPurchases(), { status: 'dormant' });
  assert.deepEqual(await api.getPlusEntitlement(), { status: 'dormant' });
});

// --- configure: lazy + once -------------------------------------------------

test('configure is not called until a wrapper runs (lazy)', () => {
  const { calls } = withRc();
  assert.equal(calls.configure.length, 0);
});

test('configure runs exactly once with the key across repeated calls', async () => {
  const { api, calls } = withRc({ offerings: offeringWith(MONTHLY_PKG, ANNUAL_PKG) });
  await api.getPlusOfferings();
  await api.getPlusOfferings();
  await api.getPlusEntitlement();
  assert.equal(calls.configure.length, 1, 'configure must be idempotent');
  assert.equal(calls.configure[0], 'appl_realkey');
});

// --- getPlusOfferings mapping -----------------------------------------------

test('getPlusOfferings maps both plans from the current offering', async () => {
  const { api } = withRc({ offerings: offeringWith(MONTHLY_PKG, ANNUAL_PKG) });
  const result = await api.getPlusOfferings();
  assert.equal(result.status, 'ok');
  assert.ok(result.status === 'ok');
  assert.deepEqual(result.monthly, { period: 'monthly', priceString: '$4.99', pkg: MONTHLY_PKG });
  assert.deepEqual(result.annual, { period: 'annual', priceString: '$39.99', pkg: ANNUAL_PKG });
});

test('getPlusOfferings returns a null plan for a product missing from the offering', async () => {
  const { api } = withRc({ offerings: offeringWith(MONTHLY_PKG) });
  const result = await api.getPlusOfferings();
  assert.ok(result.status === 'ok');
  assert.deepEqual(result.monthly, { period: 'monthly', priceString: '$4.99', pkg: MONTHLY_PKG });
  assert.equal(result.annual, null);
});

test("getPlusOfferings is 'error' when there is no current offering", async () => {
  const { api } = withRc({ offerings: { current: null } });
  assert.deepEqual(await api.getPlusOfferings(), { status: 'error' });
});

test("getPlusOfferings is 'error' when the fetch throws", async () => {
  const { api } = withRc({ offeringsError: true });
  assert.deepEqual(await api.getPlusOfferings(), { status: 'error' });
});

// --- purchasePlusPlan -------------------------------------------------------

test('purchasePlusPlan returns purchased+isPlus from the customerInfo', async () => {
  const withPlus = withRc({ purchaseInfo: customerInfo(true) });
  assert.deepEqual(await withPlus.api.purchasePlusPlan(monthlyPlan), {
    status: 'purchased',
    isPlus: true,
  });
  assert.equal(withPlus.calls.purchase[0], MONTHLY_PKG, 'passes the plan package through');

  const withoutPlus = withRc({ purchaseInfo: customerInfo(false) });
  assert.deepEqual(await withoutPlus.api.purchasePlusPlan(monthlyPlan), {
    status: 'purchased',
    isPlus: false,
  });
});

test('purchasePlusPlan maps a user cancel to cancelled, not error', async () => {
  const { api } = withRc({ purchaseError: { userCancelled: true } });
  assert.deepEqual(await api.purchasePlusPlan(monthlyPlan), { status: 'cancelled' });
});

test("purchasePlusPlan maps a real failure to 'error'", async () => {
  const { api } = withRc({ purchaseError: new Error('store down') });
  assert.deepEqual(await api.purchasePlusPlan(monthlyPlan), { status: 'error' });
});

// --- restorePlusPurchases ---------------------------------------------------

test('restorePlusPurchases maps a customerInfo with the plus entitlement to isPlus:true', async () => {
  const { api } = withRc({ restoreInfo: customerInfo(true) });
  assert.deepEqual(await api.restorePlusPurchases(), { status: 'restored', isPlus: true });
});

test('restorePlusPurchases maps a customerInfo without the plus entitlement to isPlus:false', async () => {
  const { api } = withRc({ restoreInfo: customerInfo(false) });
  assert.deepEqual(await api.restorePlusPurchases(), { status: 'restored', isPlus: false });
});

test("restorePlusPurchases is 'error' when restore throws", async () => {
  const { api } = withRc({ restoreError: true });
  assert.deepEqual(await api.restorePlusPurchases(), { status: 'error' });
});

// --- getPlusEntitlement -----------------------------------------------------

test('getPlusEntitlement reads the local plus entitlement', async () => {
  const active = withRc({ customerInfo: customerInfo(true) });
  assert.deepEqual(await active.api.getPlusEntitlement(), { status: 'ok', isPlus: true });

  const inactive = withRc({ customerInfo: customerInfo(false) });
  assert.deepEqual(await inactive.api.getPlusEntitlement(), { status: 'ok', isPlus: false });
});

test("getPlusEntitlement degrades to 'dormant' (not 'error') when the read throws", async () => {
  const { api } = withRc({ customerInfoError: true });
  assert.deepEqual(await api.getPlusEntitlement(), { status: 'dormant' });
});

// --- logIn / logOut binding -------------------------------------------------

test('logInPurchaser binds the passed user id once when configured', async () => {
  const { api, calls } = withRc();
  await api.logInPurchaser('user-42');
  assert.deepEqual(calls.logIn, ['user-42']);
});

test('logInPurchaser binds each call — de-dup is the caller (PurchaserIdentity) job', async () => {
  const { api, calls } = withRc();
  await api.logInPurchaser('user-1');
  await api.logInPurchaser('user-1');
  await api.logInPurchaser('user-2');
  assert.deepEqual(calls.logIn, ['user-1', 'user-1', 'user-2']);
});

test('logInPurchaser swallows a native failure (best-effort, never blocks the app)', async () => {
  const { api, calls } = withRc({ logInError: true });
  await assert.doesNotReject(api.logInPurchaser('user-1'));
  assert.deepEqual(calls.logIn, ['user-1']);
});

test('logOutPurchaser calls native logOut once a purchase session has been configured', async () => {
  const { api, calls } = withRc();
  await api.logInPurchaser('user-1'); // triggers configure
  await api.logOutPurchaser();
  assert.equal(calls.logOut, 1);
});

test('logOutPurchaser is a no-op before any configure (nothing to unbind)', async () => {
  let loadCalls = 0;
  const rc = fakeRc();
  const api = createPurchases({
    configured: true,
    apiKey: 'appl_realkey',
    load: () => {
      loadCalls += 1;
      return rc.mod;
    },
  });
  await api.logOutPurchaser();
  assert.equal(rc.calls.logOut, 0, 'must not log out when never configured');
  assert.equal(loadCalls, 0, 'must not even load native when never configured');
});

test('logOutPurchaser swallows a native failure (best-effort)', async () => {
  const { api } = withRc({ logOutError: true });
  await api.logInPurchaser('user-1'); // configure
  await assert.doesNotReject(api.logOutPurchaser());
});
