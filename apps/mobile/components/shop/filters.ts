/**
 * Shop filter model — the pure state behind the filter sheet.
 *
 * Holds the four narrowing dimensions (brand tier, category, budget band, size)
 * and translates them into a `ShopSearchQuery` the provider filters against. The
 * chip data — budget bands, size presets, brand-tier order — is owned by
 * `@era/core/shop` so web and mobile render the exact same options; this file
 * only carries the mobile selection state and folds it into a query. Kept JSX-free
 * so it's unit-checkable and importable by the screen.
 */
import type { BrandTier, ItemCategory, ShopSearchQuery } from '@era/core/shop';
import { BUDGET_BANDS, budgetBandToQuery } from '@era/core/shop';

/** The full filter selection. `null`/empty means the dimension is unfiltered. */
export interface ShopFilterState {
  readonly brandTier: BrandTier | null;
  readonly category: ItemCategory | null;
  readonly budgetId: string | null;
  readonly size: string;
}

/** The cleared filter state — everything off. */
export const EMPTY_FILTERS: ShopFilterState = {
  brandTier: null,
  category: null,
  budgetId: null,
  size: '',
};

/** True when any dimension is set — drives the "clear filters" affordance. */
export function hasActiveFilters(filters: ShopFilterState): boolean {
  return (
    filters.brandTier !== null ||
    filters.category !== null ||
    filters.budgetId !== null ||
    filters.size.trim().length > 0
  );
}

/**
 * Fold a `ShopSearchQuery` (e.g. a wardrobe gap's `suggestedQuery`) into the
 * mobile filter state, so "Fill this gap" lands in a pre-filtered Shop view via
 * the exact same filter→query path a manual refine uses. Category and brand tier
 * map straight across; any price bounds resolve back to their budget band (the
 * inverse of {@link toSearchQuery}), and anything unset clears to `EMPTY_FILTERS`.
 * Total: an unmatched price range simply carries no budget chip (all prices).
 */
export function filtersFromQuery(query: ShopSearchQuery): ShopFilterState {
  const budgetId =
    query.minPrice === undefined && query.maxPrice === undefined
      ? null
      : (BUDGET_BANDS.find((band) => {
          const bounds = budgetBandToQuery(band.id);
          return bounds.minPrice === query.minPrice && bounds.maxPrice === query.maxPrice;
        })?.id ?? null);
  return {
    brandTier: query.brandTier ?? null,
    category: query.category ?? null,
    budgetId,
    size: query.size ?? '',
  };
}

/** Translate the filter state (plus a page) into the provider query. */
export function toSearchQuery(filters: ShopFilterState, page: number): ShopSearchQuery {
  const query: { -readonly [K in keyof ShopSearchQuery]?: ShopSearchQuery[K] } = { page };
  if (filters.brandTier !== null) query.brandTier = filters.brandTier;
  if (filters.category !== null) query.category = filters.category;
  if (filters.budgetId !== null) {
    const { minPrice, maxPrice } = budgetBandToQuery(filters.budgetId);
    if (minPrice !== undefined) query.minPrice = minPrice;
    if (maxPrice !== undefined) query.maxPrice = maxPrice;
  }
  const size = filters.size.trim();
  if (size.length > 0) query.size = size;
  return query;
}
