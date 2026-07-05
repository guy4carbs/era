/**
 * Shop label + format helpers — the one place product data becomes display copy.
 *
 * User-facing wording lives in `strings.shop` (Quill) and `strings.closet`
 * (category words); these helpers only bind that copy to a product's data and
 * format its price. The 'why' resolver is where the trust rule shows on screen:
 * `similar_owned` is flagged `caution: true` so the card renders it as an honest
 * WARNING, never a pitch.
 */
import { strings } from '@era/core/strings';
import type { BrandTier, ProductWhy } from '@era/core/shop';

/** Currency symbols we price with; anything else falls back to the ISO code. */
const CURRENCY_SYMBOLS: Record<string, string> = {
  USD: '$',
  EUR: '€',
  GBP: '£',
};

/** Format a price as e.g. `$590`. Whole numbers only — retail fixtures are round. */
export function formatPrice(price: number, currency: string): string {
  const symbol = CURRENCY_SYMBOLS[currency];
  const amount = Math.round(price).toLocaleString('en-US');
  return symbol ? `${symbol}${amount}` : `${currency} ${amount}`;
}

/**
 * Map a `BrandTier` to its friendly label. The core enum uses `high_street`
 * (underscore); `strings.shop.brandTiers` keys it `high-street` (hyphen), so this
 * bridges the two — the one spot that conversion lives.
 */
export function brandTierLabel(tier: BrandTier): string {
  const key = tier === 'high_street' ? 'high-street' : tier;
  return strings.shop.brandTiers[key];
}

/** A resolved 'why' line plus whether it must render as a caution (honesty warning). */
export interface WhyDisplay {
  readonly text: string;
  /** True only for `similar_owned` — the trust warning, styled as caution not pitch. */
  readonly caution: boolean;
}

/**
 * Resolve a `ProductWhy` to its display line. `fills_gap` and `completes_outfits`
 * are positive pulls; `similar_owned` is the honest warning (`caution: true`) that
 * the closet may already hold something like this. A null `why` has no label — the
 * caller renders nothing.
 */
export function resolveWhy(why: ProductWhy): WhyDisplay {
  switch (why.kind) {
    case 'fills_gap':
      // Category words read naturally lowercased in the sentence ("thin on shoes").
      return {
        text: strings.shop.whyFillsGap(strings.closet.categoryLabel(why.category).toLowerCase()),
        caution: false,
      };
    case 'completes_outfits':
      return { text: strings.shop.whyCompletesOutfits(why.count), caution: false };
    case 'similar_owned':
      return { text: strings.shop.whySimilarOwned(why.ownedCount), caution: true };
  }
}
