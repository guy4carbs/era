/**
 * @era/core — the in-flow checkout core. Client-safe types + pure logic for
 * Era's cross-store cart and single-checkout surface.
 *
 * Like Shop, checkout runs on two paths behind ONE contract. A live network
 * adapter (Forge-server, dormant behind a real `RYE_API_KEY`) drives Rye's
 * universal checkout API — real offers, real orders; a deterministic FIXTURE
 * provider runs the whole flow in CI and E2E today with ZERO external calls, no
 * key, and no spend. This module is the shared contract both implement, plus the
 * pure cart math web (Nova) and mobile (Harbor) render.
 *
 * The design law this module encodes is HONESTY. In-flow checkout is offered
 * ONLY for retailers the operator has PERSONALLY sandbox-verified — the
 * `ERA_CHECKOUT_RETAILERS` allowlist ({@link parseCheckoutRetailers} /
 * {@link checkoutSupportFor}). Every other retailer keeps the unchanged affiliate
 * tap-out. And even for an in-flow order, each store still fulfils and bills its
 * own order — one checkout action, N separate shipments and receipts. The copy in
 * `strings.shop.checkout` says so plainly and NEVER claims a universal checkout.
 *
 * No server-only imports live here (no DB client, no R2, no env reads, no Rye
 * client), so this subpath is safe in a client bundle. It reuses `@era/core/shop`'s
 * {@link ShopProduct} and {@link ItemCategory} so cart and browse describe a
 * product identically.
 *
 * Import via the `@era/core/checkout` subpath.
 */

import type { ItemCategory, ShopProduct } from './shop.ts';

// -----------------------------------------------------------------------------
// Contract types — the pinned surface Forge-server, Nova, and Harbor code against
// -----------------------------------------------------------------------------

/**
 * Whether a product can be bought INSIDE Era (`in_flow`) or must tap out to the
 * retailer's own site via the existing affiliate link (`handoff`). This is decided
 * synchronously from the operator's allowlist — never a live probe — so a card can
 * render its affordance with no network round-trip. See {@link checkoutSupportFor}.
 */
export type CheckoutSupport = 'in_flow' | 'handoff';

/**
 * The checkout-intent lifecycle, Rye's vocabulary VERBATIM (verified against
 * rye.com/docs): an intent resolves an offer, waits for confirmation (optionally
 * pausing for `requires_action`, e.g. 3DS), places the order, and settles as
 * completed or failed. Persisted on the `orders` row's status and echoed to the
 * mobile poll; the server's own pre-offer state (`creating`) and terminal
 * `expired` live on the DB status enum, NOT here — this type is exactly the states
 * Rye reports for an intent.
 */
export type CheckoutIntentState =
  | 'retrieving_offer'
  | 'awaiting_confirmation'
  | 'requires_action'
  | 'placing_order'
  | 'completed'
  | 'failed';

/**
 * The buyer an intent is placed for — name, contact, and the shipping address Rye
 * needs to resolve real shipping and tax. Assembled server-side from the user's
 * saved `shipping_addresses` row plus their session email; `country` is ISO-2. This
 * is buyer PII: it never touches a client bundle beyond what the user typed, is
 * never logged, and the server is the only place it is marshalled to Rye.
 */
export interface CheckoutBuyer {
  readonly firstName: string;
  readonly lastName: string;
  readonly email: string;
  readonly phone?: string;
  readonly address1: string;
  readonly address2?: string;
  readonly city: string;
  readonly province: string;
  readonly postalCode: string;
  /** ISO-2 country code (e.g. 'US'). */
  readonly country: string;
}

/**
 * A resolved money quote for an intent, all fields INTEGER CENTS in the offer's
 * `currency`. Mapped from Rye's `cost` (`{currencyCode, amountSubunits}`) via
 * {@link subunitsToCents}. `totalCents` is what the buyer pays; the split is shown
 * before any confirmation so the price is never a surprise.
 */
export interface CheckoutOffer {
  readonly subtotalCents: number;
  readonly shippingCents: number;
  readonly taxCents: number;
  readonly totalCents: number;
  readonly currency: string;
}

/**
 * A single checkout intent — one product order at one retailer. `offer` is absent
 * until Rye resolves it (`retrieving_offer`). `vendorOrderId` is Rye's order handle,
 * present once `completed`. `failureReason` is a short machine code (e.g.
 * 'invalid_state') present only when `failed`. N sibling intents from one Era
 * checkout action are tied together by the server's `checkoutBatchId`, which lives
 * on the DB row, not here — this type is the per-order truth Rye owns.
 */
export interface CheckoutIntent {
  readonly id: string;
  readonly state: CheckoutIntentState;
  readonly offer?: CheckoutOffer;
  readonly vendorOrderId?: string;
  readonly failureReason?: string;
}

/**
 * The input to {@link CheckoutProvider.createIntent}. `productUrl` is the retailer
 * product page Rye resolves an offer against; `maxTotalCents` is a hard price
 * ceiling (the server sets it to the cart snapshot × a headroom factor) so a
 * runaway offer never auto-confirms; `referenceId` is our own order id, echoed
 * back for correlation; `variantSelections` is an opaque size/color map passed
 * through to Rye untouched.
 */
export interface CreateCheckoutIntentInput {
  readonly productUrl: string;
  readonly quantity: number;
  readonly buyer: CheckoutBuyer;
  readonly variantSelections?: Readonly<Record<string, string>>;
  readonly maxTotalCents?: number;
  readonly referenceId?: string;
}

/**
 * The payment method handed to {@link CheckoutProvider.confirmIntent}. In staging
 * this is a Stripe test token (`{type:'stripe_token', stripeToken:'tok_visa'}`);
 * live tokenization happens client-side (Era stays SAQ-A — no PAN ever reaches our
 * servers). No raw card number is ever represented here.
 */
export interface CheckoutPayment {
  readonly type: string;
  readonly stripeToken: string;
}

/**
 * The swappable checkout backend. The fixture provider is the CI/E2E path today
 * ({@link createFixtureCheckoutProvider}); the real Rye adapter (Forge-server,
 * dormant behind a real key) implements the same interface and swaps in with no
 * change to routes or UI.
 *
 * `supports()` is SYNC and allowlist-driven — NO live probe — so it can decide a
 * card's affordance instantly. `createIntent`/`getIntent`/`confirmIntent` are async
 * to match the network adapter's signature exactly.
 */
export interface CheckoutProvider {
  readonly name: string;
  supports(product: ShopProduct): CheckoutSupport;
  createIntent(input: CreateCheckoutIntentInput): Promise<CheckoutIntent>;
  getIntent(id: string): Promise<CheckoutIntent>;
  confirmIntent(id: string, payment: CheckoutPayment): Promise<CheckoutIntent>;
}

// -----------------------------------------------------------------------------
// The allowlist — the HONESTY control. Only operator-sandbox-verified retailers
// ever show an in-flow affordance; everyone else keeps the affiliate tap-out.
// -----------------------------------------------------------------------------

/** Normalize a retailer name for a stable, case-insensitive match. */
function normalizeRetailer(retailer: string): string {
  return retailer.trim().toLowerCase();
}

/**
 * Parse `ERA_CHECKOUT_RETAILERS` — a comma-separated list of retailer names the
 * operator has PERSONALLY completed a sandbox checkout for — into a normalized,
 * de-duplicated list for membership tests. This list is the honesty control: a
 * retailer appears in-flow ONLY after the operator has verified it end-to-end in
 * Rye's sandbox, so nothing here is aspirational.
 *
 * Entries are trimmed, lowercased, and empties dropped, so " Fixture , , SSENSE "
 * reads as `['fixture', 'ssense']`. An unset or blank value yields an EMPTY list,
 * which makes every product hand off (see {@link checkoutSupportFor}) — the safe
 * default. Never throws.
 */
export function parseCheckoutRetailers(raw: string | undefined): readonly string[] {
  if (raw === undefined) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const entry of raw.split(',')) {
    const normalized = normalizeRetailer(entry);
    if (normalized.length > 0 && !seen.has(normalized)) {
      seen.add(normalized);
      out.push(normalized);
    }
  }
  return out;
}

/**
 * Decide whether a product is bought in-flow or handed off, from the operator's
 * allowlist. Two conditions must BOTH hold for `in_flow`:
 *   1. the product's retailer (normalized) is on the sandbox-verified `allowlist`, and
 *   2. its `productUrl` is https — Rye resolves offers from the live product page,
 *      and we never resolve an offer from an insecure URL.
 * Anything else — empty allowlist, an unverified retailer, a non-https URL — is
 * `handoff`, the unchanged affiliate tap-out. `allowlist` is expected already
 * normalized (the output of {@link parseCheckoutRetailers}). Never throws.
 */
export function checkoutSupportFor(
  product: ShopProduct,
  allowlist: readonly string[],
): CheckoutSupport {
  if (allowlist.length === 0) return 'handoff';
  const retailerOk = allowlist.includes(normalizeRetailer(product.retailer));
  const urlOk = product.productUrl.startsWith('https://');
  return retailerOk && urlOk ? 'in_flow' : 'handoff';
}

// -----------------------------------------------------------------------------
// Money — Rye reports amounts in the currency's smallest unit ("subunits"); Era
// stores integer cents. This maps between them, honestly guarded.
// -----------------------------------------------------------------------------

/**
 * Currencies whose minor unit is NOT 1/100 of the major unit, so the 1:1
 * subunit→cent assumption below does NOT hold. Zero-decimal currencies (JPY, KRW…)
 * have no sub-major unit; three-decimal ones (BHD, KWD…) subdivide by 1000. We map
 * NONE of these today — {@link subunitsToCents} throws for them rather than silently
 * scaling a price 100× wrong. Everything absent is assumed 2-decimal (the vast
 * majority, incl. USD/EUR/GBP), where a subunit IS a cent.
 */
const NON_CENT_CURRENCY_DIGITS: Readonly<Record<string, number>> = {
  JPY: 0,
  KRW: 0,
  VND: 0,
  CLP: 0,
  ISK: 0,
  BHD: 3,
  KWD: 3,
  OMR: 3,
  TND: 3,
};

/**
 * Map Rye's `amountSubunits` to Era's integer cents. For a 2-decimal currency the
 * smallest unit IS the cent, so this is the identity (documented 1:1 assumption).
 * For any currency in {@link NON_CENT_CURRENCY_DIGITS} the mapping is undefined —
 * we don't support non-2-decimal currencies yet — so this THROWS rather than return
 * a silently wrong number. Also throws on a non-integer input (subunits are always
 * whole). The guard is deliberate: a wrong price in a checkout is worse than a loud
 * failure the server can catch and hand off.
 */
export function subunitsToCents(amountSubunits: number, currencyCode: string): number {
  if (!Number.isInteger(amountSubunits)) {
    throw new Error(`subunitsToCents: amountSubunits must be an integer, got ${amountSubunits}`);
  }
  const code = currencyCode.trim().toUpperCase();
  if (code in NON_CENT_CURRENCY_DIGITS) {
    throw new Error(
      `subunitsToCents: ${code} is not a 2-decimal currency; subunit→cent mapping is unsupported`,
    );
  }
  return amountSubunits;
}

// -----------------------------------------------------------------------------
// Cart math — pure, total, tested. The cross-store cart groups by retailer and
// combines resolved offers into per-store + grand totals for the confirm screen.
// -----------------------------------------------------------------------------

/**
 * The minimal cart-line shape the pure math needs — a denormalized snapshot of a
 * `cart_items` row (the full row carries more: title, image, urls). `retailer`
 * drives grouping; `priceSnapshotCents`/`currency`/`quantity` drive the pre-offer
 * subtotal estimate; `category` (when known) feeds {@link sizeKindForCategory} for
 * size prefill. Prices are integer cents.
 */
export interface CheckoutCartItem {
  readonly retailer: string;
  readonly priceSnapshotCents: number;
  readonly currency: string;
  readonly quantity: number;
  readonly category?: ItemCategory;
}

/**
 * One retailer's slice of the cart — its items plus a pre-offer subtotal estimate
 * from the saved price snapshots. This is an ESTIMATE (real shipping/tax arrive only
 * with a Rye offer via {@link combineOffers}); the confirm screen shows the real
 * numbers, this drives the cart list. `currency` is the group's first item's
 * currency.
 */
export interface CartRetailerGroup {
  readonly retailer: string;
  readonly items: readonly CheckoutCartItem[];
  readonly subtotalCents: number;
  readonly currency: string;
}

/**
 * Group cart items by retailer, in stable first-seen order, summing each group's
 * snapshot subtotal (`priceSnapshotCents × quantity`). The "one checkout" surface
 * is really N per-store orders, and this is where that truth first shows up: the UI
 * renders one section per retailer with its own subtotal and the separate-shipments
 * disclosure. A group's `currency` is its first item's; quantities below 1 are
 * floored to 0 contribution (a defensive guard — a real row is ≥1). Pure; never throws.
 */
export function groupCartByRetailer(items: readonly CheckoutCartItem[]): readonly CartRetailerGroup[] {
  const order: string[] = [];
  const groups = new Map<string, CheckoutCartItem[]>();
  for (const item of items) {
    const key = normalizeRetailer(item.retailer);
    let bucket = groups.get(key);
    if (bucket === undefined) {
      bucket = [];
      groups.set(key, bucket);
      order.push(key);
    }
    bucket.push(item);
  }
  return order.map((key) => {
    const bucket = groups.get(key) ?? [];
    const first = bucket[0];
    const subtotalCents = bucket.reduce((sum, item) => {
      const qty = Number.isFinite(item.quantity) && item.quantity >= 1 ? Math.floor(item.quantity) : 0;
      return sum + item.priceSnapshotCents * qty;
    }, 0);
    return {
      // Display the retailer as first seen (original casing), not the normalized key.
      retailer: first?.retailer ?? key,
      items: bucket,
      subtotalCents,
      currency: first?.currency ?? 'USD',
    };
  });
}

/**
 * A resolved offer tagged with its retailer — the input to {@link combineOffers}.
 * One per in-flow order, built from a Rye offer.
 */
export interface RetailerOffer extends CheckoutOffer {
  readonly retailer: string;
}

/** One retailer's line in a combined offer — the offer amounts without the currency (which is combined). */
export interface CombinedOfferLine {
  readonly retailer: string;
  readonly subtotalCents: number;
  readonly shippingCents: number;
  readonly taxCents: number;
  readonly totalCents: number;
}

/**
 * The confirm-screen money view: every retailer's line plus the grand total the
 * buyer authorizes across all stores.
 */
export interface CombinedOffer {
  readonly perRetailer: readonly CombinedOfferLine[];
  readonly grandTotalCents: number;
  readonly currency: string;
}

/**
 * Combine per-retailer offers into the per-store lines + one grand total shown
 * BEFORE the buyer confirms. Era is single-currency (USD) today, but the schema
 * stores a currency per row, so this guards the mixed-currency edge honestly rather
 * than silently adding across currencies: the FIRST offer's currency wins, and only
 * offers in that currency contribute to `grandTotalCents`. Every offer still appears
 * in `perRetailer` (nothing is hidden), so a caller can detect a stray currency by
 * comparing line count to the summed set. An empty input yields a zero total in a
 * documented 'USD' default. Pure; never throws.
 */
export function combineOffers(offers: readonly RetailerOffer[]): CombinedOffer {
  const currency = offers[0]?.currency ?? 'USD';
  const perRetailer: CombinedOfferLine[] = offers.map((offer) => ({
    retailer: offer.retailer,
    subtotalCents: offer.subtotalCents,
    shippingCents: offer.shippingCents,
    taxCents: offer.taxCents,
    totalCents: offer.totalCents,
  }));
  const grandTotalCents = offers.reduce(
    (sum, offer) => (offer.currency === currency ? sum + offer.totalCents : sum),
    0,
  );
  return { perRetailer, grandTotalCents, currency };
}

/**
 * The size dimension a category is sized in — the key that picks WHICH saved size
 * to prefill at checkout (`user_sizes` stores `apparelSize` / `denimSize` /
 * `shoeSize`, plus everything else is `one_size`).
 */
export type SizeKind = 'apparel' | 'denim' | 'shoe' | 'one_size';

/**
 * Map an item category to its size dimension, for prefilling a saved size at
 * checkout. Grounded in `SIZE_OPTIONS` (shop.ts): apparel (XS–XL), denim waist
 * (24–32), EU shoe (37–42), and `One Size` for everything without a body size.
 *
 * The one judgement call is `bottom`. In the catalog a bottom carries EITHER apparel
 * sizes (trousers: S–XL) or denim-waist sizes (jeans: 24–32), but this map keys on
 * CATEGORY alone, and the `user_sizes` schema gives bottoms exactly one dedicated
 * column: `denimSize` (waist). So `bottom → 'denim'` is the least-wrong, schema-honest
 * call — the waist size is the single bottom-specific size we store — and apparel
 * sizing (S–XL) is reserved for the torso garments (top, dress, outerwear). If a
 * prefilled waist size looks wrong for a trouser, the user edits it inline; we never
 * guess a body measurement we don't hold.
 */
export function sizeKindForCategory(category: ItemCategory): SizeKind {
  switch (category) {
    case 'top':
    case 'dress':
    case 'outerwear':
      return 'apparel';
    case 'bottom':
      return 'denim';
    case 'shoes':
      return 'shoe';
    case 'bag':
    case 'hat':
    case 'scarf':
    case 'watch':
    case 'jewelry':
    case 'accessory':
      return 'one_size';
    default:
      // Exhaustive over ItemCategory today; a new enum value defaults to the safest
      // "no body size" bucket rather than mis-prefilling a size we don't have.
      return 'one_size';
  }
}

// -----------------------------------------------------------------------------
// Fixture provider — the deterministic, $0 CI/E2E vehicle. Same interface as the
// real Rye adapter; proves create → offer → confirm → completed (and the failure
// edges) with no network, no key, no spend.
// -----------------------------------------------------------------------------

/** Flat shipping the fixture quotes on every offer, in cents. */
const FIXTURE_SHIPPING_CENTS = 500;
/** Sales-tax rate the fixture applies to the subtotal — a fixed 8%. */
const FIXTURE_TAX_RATE = 0.08;

/**
 * A stable FNV-1a hash of the product URL → a whole-dollar price in [$20, $520).
 * Deterministic: the same URL always quotes the same unit price, so a fixture run
 * is reproducible in CI. Purely synthetic — the fixture has no real catalog.
 */
function fixtureUnitPriceCents(productUrl: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < productUrl.length; i += 1) {
    hash ^= productUrl.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  const dollars = 20 + (hash % 500);
  return dollars * 100;
}

/** Deterministic offer from the input: unit price × quantity, flat shipping, 8% tax. */
function fixtureOffer(input: CreateCheckoutIntentInput): CheckoutOffer {
  const quantity =
    Number.isFinite(input.quantity) && input.quantity >= 1 ? Math.floor(input.quantity) : 1;
  const subtotalCents = fixtureUnitPriceCents(input.productUrl) * quantity;
  const shippingCents = FIXTURE_SHIPPING_CENTS;
  const taxCents = Math.round(subtotalCents * FIXTURE_TAX_RATE);
  const totalCents = subtotalCents + shippingCents + taxCents;
  return { subtotalCents, shippingCents, taxCents, totalCents, currency: 'USD' };
}

/**
 * A {@link CheckoutProvider} backed by an in-memory intent store — the $0 CI/E2E
 * vehicle. Fully offline (no network, no key, no spend), so the whole checkout flow
 * is exercisable in tests and TestFlight before the operator ever funds Rye's trial.
 *
 * Behavior:
 *   - `supports(product)` → `in_flow` for the reserved retailer 'Fixture'
 *     (case-insensitive), `handoff` for everything else. The fixture is the one
 *     always-in-flow retailer, independent of the operator allowlist.
 *   - `createIntent(input)` → a fresh intent in `awaiting_confirmation` carrying a
 *     deterministic {@link fixtureOffer} (price + flat 500¢ shipping + 8% tax).
 *   - `getIntent(id)` → echoes the stored intent; rejects for an unknown id
 *     (mirrors a 404 from Rye).
 *   - `confirmIntent(id, payment)` → from `awaiting_confirmation` transitions to
 *     `completed` with a deterministic fake `vendorOrderId`. From ANY other state it
 *     fails with `failureReason: 'invalid_state'`. A missing/blank payment token
 *     fails with `failureReason: 'invalid_payment'` (Rye rejects a confirm with no
 *     payment method — the fixture honors the same precondition). Rejects for an
 *     unknown id.
 *
 * Each call to this factory returns an INDEPENDENT store, so tests don't leak state.
 */
export function createFixtureCheckoutProvider(): CheckoutProvider {
  const store = new Map<string, CheckoutIntent>();
  let counter = 0;

  return {
    name: 'fixture',

    supports(product: ShopProduct): CheckoutSupport {
      return normalizeRetailer(product.retailer) === 'fixture' ? 'in_flow' : 'handoff';
    },

    createIntent(input: CreateCheckoutIntentInput): Promise<CheckoutIntent> {
      counter += 1;
      const id = `ci_fixture_${counter}`;
      const intent: CheckoutIntent = {
        id,
        state: 'awaiting_confirmation',
        offer: fixtureOffer(input),
      };
      store.set(id, intent);
      return Promise.resolve(intent);
    },

    getIntent(id: string): Promise<CheckoutIntent> {
      const intent = store.get(id);
      if (intent === undefined) {
        return Promise.reject(new Error(`fixture checkout: unknown intent ${id}`));
      }
      return Promise.resolve(intent);
    },

    confirmIntent(id: string, payment: CheckoutPayment): Promise<CheckoutIntent> {
      const intent = store.get(id);
      if (intent === undefined) {
        return Promise.reject(new Error(`fixture checkout: unknown intent ${id}`));
      }
      if (payment.stripeToken.trim().length === 0) {
        const failed: CheckoutIntent = { ...intent, state: 'failed', failureReason: 'invalid_payment' };
        store.set(id, failed);
        return Promise.resolve(failed);
      }
      if (intent.state !== 'awaiting_confirmation') {
        const failed: CheckoutIntent = { ...intent, state: 'failed', failureReason: 'invalid_state' };
        store.set(id, failed);
        return Promise.resolve(failed);
      }
      const completed: CheckoutIntent = {
        ...intent,
        state: 'completed',
        vendorOrderId: `fixture_order_${id}`,
      };
      store.set(id, completed);
      return Promise.resolve(completed);
    },
  };
}
