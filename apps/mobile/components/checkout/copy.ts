/**
 * Checkout surface — a SMALL set of mobile-local labels the frozen `@era/core`
 * `strings.shop.checkout` block does not (yet) carry: the Settings section
 * headings for saved sizes and shipping address, the size-dimension labels, the
 * address capture-form field labels/placeholders, and the quiet handoff-section
 * wording. Everything user-facing that DOES exist in core (the CTAs, the
 * separate-shipments disclosure, the per-state progress, the per-store outcomes,
 * the orders list) is consumed from `strings.shop.checkout` directly — this file
 * is only the gap.
 *
 * CONTRACT NOTE (Harbor -> Forge/Nova/Quill): these are candidates to promote into
 * `strings.shop.checkout` (or `strings.settings`) when the core string contract
 * reopens, so web and mobile share one voice for the checkout chrome. Kept in
 * Era's calm, plain voice — no fake urgency, no universal-checkout claim. Mobile-
 * owned and isolated here so the promotion is a single move. Mirrors the
 * `components/avatar/copy.ts` precedent.
 */

/** Labels the core `strings.shop.checkout` block doesn't cover yet — see the module doc. */
export const checkoutCopy = {
  /** Accessibility label for the Shop-tab cart entry point. */
  cartEntry: 'Your cart',
  /** Accessibility label announcing the cart's item count. `cartCount(2)`. */
  cartCount: (count: number): string => `${count} ${count === 1 ? 'item' : 'items'} in your cart`,

  // --- the cart's handoff section: pieces that must finish at the retailer -----

  /** Quiet section heading for cart pieces that can't be bought in-flow. */
  handoffSectionTitle: 'Finish these at the store',
  /** Tap-out CTA for a handoff piece, named to the store. `finishAt('Zara')`. */
  finishAt: (retailer: string): string => `Finish at ${retailer}`,
  /** The change-size affordance on a cart item's size chip. */
  changeSize: 'Change',

  // --- Settings: saved sizes ---------------------------------------------------

  /** Settings section heading for the saved-size editor. */
  sizesTitle: 'Your sizes',
  /** Plain explainer — what the sizes are for, no pressure. */
  sizesExplain: 'Saved so a piece arrives with your size already filled in at checkout. You can change any of them.',
  /** Label above the apparel-size chips (tops, dresses, outerwear). */
  apparelLabel: 'Apparel',
  /** Label above the denim/waist-size chips (bottoms). */
  denimLabel: 'Denim (waist)',
  /** Label above the shoe-size chips. */
  shoeLabel: 'Shoes (EU)',

  // --- Settings: shipping address ---------------------------------------------

  /** Settings section heading for the shipping-address form. */
  shippingTitle: 'Shipping address',
  /** Plain explainer under the heading. */
  shippingExplain: 'Where your in-flow orders ship. Saved for checkout; you can edit or remove it any time.',
  /** Edit affordance on the address summary row. */
  editAddress: 'Edit',
  /** Save action in the address form. */
  saveAddress: 'Save address',
  /** Destructive remove action for the saved address. */
  deleteAddress: 'Remove address',
  /** Field marker for an empty required address field. */
  fieldRequired: 'Required',

  /** Address form field labels + placeholders, in render order. */
  fields: {
    firstName: { label: 'First name', placeholder: 'First name' },
    lastName: { label: 'Last name', placeholder: 'Last name' },
    phone: { label: 'Phone (optional)', placeholder: 'Phone' },
    address1: { label: 'Address', placeholder: 'Street address' },
    address2: { label: 'Apartment, suite (optional)', placeholder: 'Apt, suite, unit' },
    city: { label: 'City', placeholder: 'City' },
    province: { label: 'State / Province', placeholder: 'State or province' },
    postalCode: { label: 'Postal code', placeholder: 'Postal code' },
    country: { label: 'Country', placeholder: 'US' },
  },
  /** Helper under the country field — it takes a two-letter ISO-2 code. */
  countryHelp: 'Two-letter country code, e.g. US.',
} as const;

/** Currency symbols we price with; anything else falls back to the ISO code. */
const CURRENCY_SYMBOLS: Record<string, string> = {
  USD: '$',
  EUR: '€',
  GBP: '£',
};

/**
 * Format an INTEGER-CENTS amount as display money, e.g. `24000 -> "$240"`,
 * `1920 -> "$19.20"`. Whole dollars render without decimals (matching the app's
 * round-price convention); a cents remainder (a real tax line) shows two places so
 * a checkout total is never quietly rounded. Mirrors `shop/labels.ts` `formatPrice`
 * for symbol handling. The offer amounts are the only place non-round money appears.
 */
export function formatCents(cents: number, currency: string): string {
  const symbol = CURRENCY_SYMBOLS[currency];
  const dollars = cents / 100;
  const amount = Number.isInteger(dollars)
    ? dollars.toLocaleString('en-US')
    : dollars.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return symbol ? `${symbol}${amount}` : `${currency} ${amount}`;
}
