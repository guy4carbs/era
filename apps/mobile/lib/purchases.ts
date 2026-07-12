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
interface RcPackage {
  readonly identifier: string;
  readonly product: StoreProduct;
}
interface RcOffering {
  readonly availablePackages: readonly RcPackage[];
}
interface RcOfferings {
  readonly current: RcOffering | null;
}
interface RcCustomerInfo {
  readonly entitlements: { readonly active: Record<string, { readonly identifier: string }> };
}
interface RcPurchaseError {
  readonly userCancelled?: boolean;
  readonly message?: string;
}
interface RevenueCatModule {
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
// server-tainted and not client-safe.
function isRealCredential(value: string | undefined): value is string {
  return Boolean(value) && !value!.startsWith('change-me');
}

/** Whether the Era+ feature flag is on — gates every Era+ surface in the UI. */
export const eraPlusEnabled = process.env.EXPO_PUBLIC_ERA_PLUS_ENABLED === 'true';

const iosKey = process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY;

/**
 * Whether real purchases can run: the flag is on AND a real (non-placeholder) RC
 * key is present. False → dormant; the wrappers below no-op with `'dormant'`.
 */
export const purchasesConfigured = eraPlusEnabled && isRealCredential(iosKey);

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

let configured = false;

/**
 * Configure RevenueCat exactly once, only when a real key is present. Returns the
 * native module, or null when dormant / unavailable (Expo Go, missing package).
 */
function ensureConfigured(): RevenueCatModule | null {
  if (!purchasesConfigured || !iosKey) {
    return null;
  }
  const Purchases = loadRevenueCat();
  if (!Purchases) {
    return null;
  }
  if (!configured) {
    Purchases.configure({ apiKey: iosKey });
    configured = true;
  }
  return Purchases;
}

/**
 * Bind the RevenueCat app-user to the Era user id after auth resolves, so
 * purchases attach to the account (and follow it across devices). No-op when
 * dormant. Best-effort — a failure here must never block the app.
 */
export async function logInPurchaser(userId: string): Promise<void> {
  const Purchases = ensureConfigured();
  if (!Purchases) {
    return;
  }
  try {
    await Purchases.logIn(userId);
  } catch {
    // Best-effort identity binding; server entitlement remains the source of truth.
  }
}

/**
 * Reset the RevenueCat app-user to an anonymous id on sign-out, so the next user
 * on the device doesn't inherit the previous account's purchaser. No-op when
 * dormant / never configured.
 */
export async function logOutPurchaser(): Promise<void> {
  if (!configured) {
    return;
  }
  const Purchases = loadRevenueCat();
  if (!Purchases) {
    return;
  }
  try {
    await Purchases.logOut();
  } catch {
    // Best-effort.
  }
}

/** Find the package for a product id within the current offering. */
function findPlan(offering: RcOffering, productId: string, period: PlusPlan['period']): PlusPlan | null {
  const pkg = offering.availablePackages.find((p) => p.product.identifier === productId);
  if (!pkg) {
    return null;
  }
  return { period, priceString: pkg.product.priceString, pkg };
}

/**
 * Fetch the current Era+ offering's monthly + annual plans. `'dormant'` when
 * unconfigured (the paywall shows its calm unavailable state); `'error'` when a
 * configured fetch fails (the paywall offers a retry).
 */
export async function getPlusOfferings(): Promise<OfferingsResult> {
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
}

/** True when a customerInfo carries the active `plus` entitlement. */
function isPlusActive(info: RcCustomerInfo): boolean {
  return Boolean(info.entitlements.active[PLUS_ENTITLEMENT_ID]);
}

/**
 * Run the store purchase flow for a plan. Distinguishes a user cancel (calm, no
 * error copy) from a real failure. The returned `isPlus` is RevenueCat's local
 * read for IMMEDIATE UX only — the server subscriptions cache is authoritative.
 */
export async function purchasePlusPlan(plan: PlusPlan): Promise<PurchaseResult> {
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
}

/**
 * Restore prior purchases for the signed-in store account. `isPlus` is the local
 * post-restore read for immediate UX; the server remains the source of truth.
 */
export async function restorePlusPurchases(): Promise<RestoreResult> {
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
}

/**
 * Read the local RevenueCat entitlement for immediate paywall UX (e.g. showing
 * the calm "you're already Plus" management state right after a purchase).
 * `'dormant'` when unconfigured. NOT the durable grant — that is server-side.
 */
export async function getPlusEntitlement(): Promise<EntitlementResult> {
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
}
