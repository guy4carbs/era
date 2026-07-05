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
import { budgetBandToQuery } from '@era/core/shop';

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
