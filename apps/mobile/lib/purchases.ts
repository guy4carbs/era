/**
 * Era+ purchases — the one client surface for RevenueCat.
 *
 * Every screen touches subscriptions through this module and nothing else knows
 * RevenueCat is behind it. It is DORMANT by default and stays that way until two
 * conditions BOTH hold:
 *
 *   - `EXPO_PUBLIC_ERA_PLUS_ENABLED === 'true'` — the Era+ feature flag. When off,
 *     no Era+ UI is shown and this module is inert.
 *   - `EXPO_PUBLIC_REVENUECAT_IOS_KEY` is a REAL public SDK key — a committed
 *     `change-me-*` placeholder reads as unconfigured, so we never call
 *     `Purchases.configure` with a placeholder.
 *
 * When unconfigured, every wrapper resolves to a typed `'dormant'` result and
 * never touches the native module — so the app runs in Expo Go today without a
 * dev build and without crashing.
 *
 * NATIVE MODULE — REQUIRES A DEV/EAS BUILD. `react-native-purchases` is a native
 * module; it is NOT present in Expo Go. We therefore guard the native import
 * itself behind a dynamic `require` (see {@link loadRevenueCat}) so merely
 * importing this file — or running dormant — cannot pull the native binding into
 * a JS-only runtime. No Expo config plugin is required for bare in-app purchases.
 *
 * SERVER IS THE SOURCE OF TRUTH for entitlement gating (the server-side
 * subscriptions cache). The local RevenueCat `customerInfo` this module reads is
 * for IMMEDIATE post-purchase UX only — never treat it as the durable grant.
 */

/** The Era+ entitlement identifier configured in RevenueCat. */
const PLUS_ENTITLEMENT_ID = 'plus';

/** Store product identifiers for the two Era+ plans. */
const MONTHLY_PRODUCT_ID = 'era_plus_monthly';
const ANNUAL_PRODUCT_ID = 'era_plus_annual';

/**
 * Minimal structural view of the `react-native-purchases` surface we use. Kept
 * local (rather than `import type`) so this module typechecks before the native
 * package is installed at reconcile; replace with the SDK's own types
 * (`PurchasesPackage`, `CustomerInfo`, …) once it is in the lockfile.
 */
interface StoreProduct {
  readonly identifier: string;
  /** Localized, store-formatted price, e.g. "$4.99". Render this verbatim. */
  readonly priceString: string;
}
export interface RcPackage {
  readonly identifier: string;
  readonly product: StoreProduct;
}
export interface RcOffering {
  readonly availablePackages: readonly RcPackage[];
}
export interface RcOfferings {
  readonly current: RcOffering | null;
}
export interface RcCustomerInfo {
  readonly entitlements: { readonly active: Record<string, { readonly identifier: string }> };
}
interface RcPurchaseError {
  readonly userCancelled?: boolean;
  readonly message?: string;
}
export interface RevenueCatModule {
  configure(options: { apiKey: string; appUserID?: string | null }): void;
  logIn(appUserID: string): Promise<{ customerInfo: RcCustomerInfo; created: boolean }>;
  logOut(): Promise<RcCustomerInfo>;
  getOfferings(): Promise<RcOfferings>;
  getCustomerInfo(): Promise<RcCustomerInfo>;
  purchasePackage(pkg: RcPackage): Promise<{ customerInfo: RcCustomerInfo }>;
  restorePurchases(): Promise<RcCustomerInfo>;
}

/** The one plan the paywall renders a card for. */
export interface PlusPlan {
  readonly period: 'monthly' | 'annual';
  /** Store-formatted price string from RevenueCat (already localized). */
  readonly priceString: string;
  /** Opaque handle passed back to {@link purchasePlusPlan}. */
  readonly pkg: RcPackage;
}

export type OfferingsResult =
  | { readonly status: 'ok'; readonly monthly: PlusPlan | null; readonly annual: PlusPlan | null }
  | { readonly status: 'dormant' }
  | { readonly status: 'error' };

export type PurchaseResult =
  | { readonly status: 'purchased'; readonly isPlus: boolean }
  | { readonly status: 'cancelled' }
  | { readonly status: 'dormant' }
  | { readonly status: 'error' };

export type RestoreResult =
  | { readonly status: 'restored'; readonly isPlus: boolean }
  | { readonly status: 'dormant' }
  | { readonly status: 'error' };

export type EntitlementResult =
  | { readonly status: 'ok'; readonly isPlus: boolean }
  | { readonly status: 'dormant' };

// Mirrors @era/core's `isRealCredential` (apps/web/src/lib/send-email.ts): a
// committed `change-me-*` placeholder reads as unconfigured, so a dormant key
// never reaches `Purchases.configure`. Replicated locally because that helper is
// server-tainted and not client-safe. Exported so the placeholder guard is unit
// testable without a native build.
export function isRealCredential(value: string | undefined): value is string {
  return Boolean(value) && !value!.startsWith('change-me');
}

/**
 * Whether real purchases can run for a given environment: the Era+ flag is on AND
 * a real (non-placeholder) RC key is present. Pure and env-injected so both
 * dormancy causes — flag off, or a `change-me-*` placeholder key — are unit
 * testable in a single process.
 */
export function computePurchasesConfigured(
  env: { readonly [key: string]: string | undefined } = process.env,
): boolean {
  return (
    env.EXPO_PUBLIC_ERA_PLUS_ENABLED === 'true' &&
    isRealCredential(env.EXPO_PUBLIC_REVENUECAT_IOS_KEY)
  );
}

/** Whether the Era+ feature flag is on — gates every Era+ surface in the UI. */
export const eraPlusEnabled = process.env.EXPO_PUBLIC_ERA_PLUS_ENABLED === 'true';

const iosKey = process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY;

/**
 * Whether real purchases can run: the flag is on AND a real (non-placeholder) RC
 * key is present. False → dormant; the wrappers below no-op with `'dormant'`.
 */
export const purchasesConfigured = computePurchasesConfigured();

/**
 * Dynamically load the native module. A plain top-level `import` would bind the
 * native module at load time and throw in Expo Go; the `require` is caught so a
 * JS-only runtime (or a missing package before the dev build) degrades to
 * dormant instead of crashing.
 */
function loadRevenueCat(): RevenueCatModule | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('react-native-purchases') as { default: RevenueCatModule };
    return mod.default;
  } catch {
    return null;
  }
}

/**
 * The injectable seam. Production wires the env-derived config + the native
 * `require` loader; tests pass a fake native module and arbitrary config, so
 * every branch is exercised without a dev/EAS build. Mirrors the
 * `StripePlusClient` DI idiom in `apps/web/src/lib/plus-stripe.ts`.
 */
export interface PurchasesDeps {
  /** Whether real purchases can run (the flag is on AND a real key is present). */
  readonly configured: boolean;
  /** The RC iOS public SDK key — only read when {@link PurchasesDeps.configured}. */
  readonly apiKey: string | undefined;
  /** Load the native module, or null in a JS-only runtime / before the dev build. */
  readonly load: () => RevenueCatModule | null;
}

/** The Era+ purchase surface every screen consumes (see the named exports below). */
export interface PurchasesApi {
  logInPurchaser(userId: string): Promise<void>;
  logOutPurchaser(): Promise<void>;
  getPlusOfferings(): Promise<OfferingsResult>;
  purchasePlusPlan(plan: PlusPlan): Promise<PurchaseResult>;
  restorePlusPurchases(): Promise<RestoreResult>;
  getPlusEntitlement(): Promise<EntitlementResult>;
}

/** Find the package for a product id within the current offering. */
function findPlan(offering: RcOffering, productId: string, period: PlusPlan['period']): PlusPlan | null {
  const pkg = offering.availablePackages.find((p) => p.product.identifier === productId);
  if (!pkg) {
    return null;
  }
  return { period, priceString: pkg.product.priceString, pkg };
}

/** True when a customerInfo carries the active `plus` entitlement. */
function isPlusActive(info: RcCustomerInfo): boolean {
  return Boolean(info.entitlements.active[PLUS_ENTITLEMENT_ID]);
}

/**
 * Build the Era+ purchase surface over a set of dependencies. The `configure`
 * latch is held privately, so each instance (and each test) starts unconfigured.
 * The default, production-wired instance is created just below.
 */
export function createPurchases(deps: PurchasesDeps): PurchasesApi {
  let configured = false;

  /**
   * Configure RevenueCat exactly once, only when a real key is present. Returns
   * the native module, or null when dormant / unavailable (Expo Go, missing
   * package).
   */
  function ensureConfigured(): RevenueCatModule | null {
    if (!deps.configured || !deps.apiKey) {
      return null;
    }
    const Purchases = deps.load();
    if (!Purchases) {
      return null;
    }
    if (!configured) {
      Purchases.configure({ apiKey: deps.apiKey });
      configured = true;
    }
    return Purchases;
  }

  return {
    async logInPurchaser(userId: string): Promise<void> {
      const Purchases = ensureConfigured();
      if (!Purchases) {
        return;
      }
      try {
        await Purchases.logIn(userId);
      } catch {
        // Best-effort identity binding; server entitlement remains the source of truth.
      }
    },

    async logOutPurchaser(): Promise<void> {
      if (!configured) {
        return;
      }
      const Purchases = deps.load();
      if (!Purchases) {
        return;
      }
      try {
        await Purchases.logOut();
      } catch {
        // Best-effort.
      }
    },

    async getPlusOfferings(): Promise<OfferingsResult> {
      const Purchases = ensureConfigured();
      if (!Purchases) {
        return { status: 'dormant' };
      }
      try {
        const offerings = await Purchases.getOfferings();
        const current = offerings.current;
        if (!current) {
          return { status: 'error' };
        }
        return {
          status: 'ok',
          monthly: findPlan(current, MONTHLY_PRODUCT_ID, 'monthly'),
          annual: findPlan(current, ANNUAL_PRODUCT_ID, 'annual'),
        };
      } catch {
        return { status: 'error' };
      }
    },

    async purchasePlusPlan(plan: PlusPlan): Promise<PurchaseResult> {
      const Purchases = ensureConfigured();
      if (!Purchases) {
        return { status: 'dormant' };
      }
      try {
        const { customerInfo } = await Purchases.purchasePackage(plan.pkg);
        return { status: 'purchased', isPlus: isPlusActive(customerInfo) };
      } catch (error) {
        if ((error as RcPurchaseError)?.userCancelled) {
          return { status: 'cancelled' };
        }
        return { status: 'error' };
      }
    },

    async restorePlusPurchases(): Promise<RestoreResult> {
      const Purchases = ensureConfigured();
      if (!Purchases) {
        return { status: 'dormant' };
      }
      try {
        const info = await Purchases.restorePurchases();
        return { status: 'restored', isPlus: isPlusActive(info) };
      } catch {
        return { status: 'error' };
      }
    },

    async getPlusEntitlement(): Promise<EntitlementResult> {
      const Purchases = ensureConfigured();
      if (!Purchases) {
        return { status: 'dormant' };
      }
      try {
        const info = await Purchases.getCustomerInfo();
        return { status: 'ok', isPlus: isPlusActive(info) };
      } catch {
        return { status: 'dormant' };
      }
    },
  };
}

/**
 * The default, production-wired instance: the env-derived config + the native
 * `require` loader. The screens import the named bindings below and never see the
 * seam. DORMANT unless the flag is on and a real key is present.
 */
const defaultPurchases = createPurchases({
  configured: purchasesConfigured,
  apiKey: iosKey,
  load: loadRevenueCat,
});

/**
 * Bind the RevenueCat app-user to the Era user id after auth resolves, so
 * purchases attach to the account (and follow it across devices). No-op when
 * dormant. Best-effort — a failure here must never block the app. Binding only on
 * an actual user change is the caller's job — see `PurchaserIdentity` in
 * `app/_layout.tsx`.
 */
export const logInPurchaser = defaultPurchases.logInPurchaser;

/**
 * Reset the RevenueCat app-user to an anonymous id on sign-out, so the next user
 * on the device doesn't inherit the previous account's purchaser. No-op when
 * dormant / never configured.
 */
export const logOutPurchaser = defaultPurchases.logOutPurchaser;

/**
 * Fetch the current Era+ offering's monthly + annual plans. `'dormant'` when
 * unconfigured (the paywall shows its calm unavailable state); `'error'` when a
 * configured fetch fails (the paywall offers a retry).
 */
export const getPlusOfferings = defaultPurchases.getPlusOfferings;

/**
 * Run the store purchase flow for a plan. Distinguishes a user cancel (calm, no
 * error copy) from a real failure. The returned `isPlus` is RevenueCat's local
 * read for IMMEDIATE UX only — the server subscriptions cache is authoritative.
 */
export const purchasePlusPlan = defaultPurchases.purchasePlusPlan;

/**
 * Restore prior purchases for the signed-in store account. `isPlus` is the local
 * post-restore read for immediate UX; the server remains the source of truth.
 */
export const restorePlusPurchases = defaultPurchases.restorePlusPurchases;

/**
 * Read the local RevenueCat entitlement for immediate paywall UX (e.g. showing
 * the calm "you're already Plus" management state right after a purchase).
 * `'dormant'` when unconfigured. NOT the durable grant — that is server-side.
 */
export const getPlusEntitlement = defaultPurchases.getPlusEntitlement;
