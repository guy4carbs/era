/**
 * Shop filter model — the pure state behind the filter sheet.
 *
 * Holds the four narrowing dimensions (brand tier, category, budget band, size)
 * and translates them into a `ShopSearchQuery` the provider filters against.
 * Budget is offered as a few round bands rather than free-entry min/max, so the
 * sheet stays tap-only and calm; each band maps to the query's `minPrice`/
 * `maxPrice`. Kept JSX-free so it's unit-checkable and importable by the screen.
 */
import type { BrandTier, ItemCategory, ShopSearchQuery } from '@era/core/shop';

import { formatPrice } from './labels';

/** The four brand tiers, in descending price order — drives the tier chips. */
export const BRAND_TIERS: readonly BrandTier[] = [
  'luxury',
  'premium',
  'contemporary',
  'high_street',
];

/** A budget band → an optional min/max in USD (fixtures price in USD). */
export interface BudgetBand {
  readonly id: string;
  readonly min?: number;
  readonly max?: number;
}

/** Round price bands, ascending. Labels are numeric/symbol only (no prose). */
export const BUDGET_BANDS: readonly BudgetBand[] = [
  { id: 'under-100', max: 100 },
  { id: '100-300', min: 100, max: 300 },
  { id: '300-600', min: 300, max: 600 },
  { id: '600-plus', min: 600 },
];

/** Symbol-only label for a band, e.g. `< $100`, `$100–$300`, `$600+`. */
export function budgetBandLabel(band: BudgetBand): string {
  if (band.min === undefined && band.max !== undefined) {
    return `< ${formatPrice(band.max, 'USD')}`;
  }
  if (band.min !== undefined && band.max === undefined) {
    return `${formatPrice(band.min, 'USD')}+`;
  }
  return `${formatPrice(band.min ?? 0, 'USD')}–${formatPrice(band.max ?? 0, 'USD')}`;
}

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
  const band = BUDGET_BANDS.find((b) => b.id === filters.budgetId);
  if (band) {
    if (band.min !== undefined) query.minPrice = band.min;
    if (band.max !== undefined) query.maxPrice = band.max;
  }
  const size = filters.size.trim();
  if (size.length > 0) query.size = size;
  return query;
}
