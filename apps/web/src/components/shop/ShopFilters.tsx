'use client';

import { type CSSProperties } from 'react';
import { strings } from '@era/core/strings';
import { Text } from '../Text';
import type { BrandTier, ItemCategory, ShopSearchQuery } from '@era/core/shop';
import { BUDGET_BANDS, SIZE_OPTIONS, BRAND_TIER_ORDER, budgetBandToQuery } from '@era/core/shop';
import { CATEGORY_OPTIONS } from '../items';
import { Chip } from '../Chip';

/**
 * The Shop filter state, one selection per axis. Budget is a preset id (mapped to
 * a price band on the way to the query) rather than raw min/max — a short list of
 * bands reads calmer than a dual slider and keeps Shop from feeling like a
 * catalog. `null` on an axis = no filter there.
 */
export interface ShopFilterState {
  readonly budgetId: string | null;
  readonly brandTier: BrandTier | null;
  readonly category: ItemCategory | null;
  readonly size: string | null;
}

export const EMPTY_FILTERS: ShopFilterState = {
  budgetId: null,
  brandTier: null,
  category: null,
  size: null,
};

/**
 * Friendly tier label. The copy deck keys the high-street label as `'high-street'`
 * (hyphen) while the type is `'high_street'` (underscore), so this bridges the two.
 */
function tierLabel(tier: BrandTier): string {
  return tier === 'high_street'
    ? strings.shop.brandTiers['high-street']
    : strings.shop.brandTiers[tier];
}

/** True when any axis is set — gates the "Clear filters" affordance. */
export function hasActiveFilters(filters: ShopFilterState): boolean {
  return (
    filters.budgetId !== null ||
    filters.brandTier !== null ||
    filters.category !== null ||
    filters.size !== null
  );
}

/** Fold the filter state into the provider query (drops every unset axis). */
export function queryFromFilters(filters: ShopFilterState): ShopSearchQuery {
  const budget = filters.budgetId !== null ? budgetBandToQuery(filters.budgetId) : {};
  return {
    category: filters.category ?? undefined,
    brandTier: filters.brandTier ?? undefined,
    minPrice: budget.minPrice,
    maxPrice: budget.maxPrice,
    size: filters.size ?? undefined,
  };
}

/**
 * The inverse of {@link queryFromFilters}: fold a provider query back into filter
 * state so a pre-filtered entry point — a wardrobe gap's `suggestedQuery` — can
 * drive the same chip bar the user would set by hand. Price bounds resolve back to
 * the single budget band that set them; a query with no (or an unrecognised) price
 * pair leaves budget unset. Every axis the query omits stays `null`.
 */
export function filtersFromQuery(query: ShopSearchQuery): ShopFilterState {
  const band = BUDGET_BANDS.find(
    (b) => b.minPrice === query.minPrice && b.maxPrice === query.maxPrice,
  );
  return {
    budgetId: band?.id ?? null,
    brandTier: query.brandTier ?? null,
    category: query.category ?? null,
    size: query.size ?? null,
  };
}

export interface ShopFiltersProps {
  filters: ShopFilterState;
  onChange: (next: ShopFilterState) => void;
}

/**
 * The filter bar: four labelled chip rows (budget, brand tier, category, size)
 * and a "Clear filters" reset that only appears once something is set. Each chip
 * toggles its axis; selecting re-queries upstream. Rows scroll horizontally so
 * the bar never wraps into a wall.
 */
export function ShopFilters({ filters, onChange }: ShopFiltersProps) {
  // Toggle helper: picking the active value again clears that axis.
  const set = <K extends keyof ShopFilterState>(key: K, value: ShopFilterState[K]) =>
    onChange({ ...filters, [key]: filters[key] === value ? null : value });

  return (
    <div style={containerStyle}>
      <FilterRow label={strings.shop.filterBudget}>
        {BUDGET_BANDS.map((b) => (
          <Chip key={b.id} selected={filters.budgetId === b.id} onClick={() => set('budgetId', b.id)}>
            {b.label}
          </Chip>
        ))}
      </FilterRow>

      <FilterRow label={strings.shop.filterBrandTier}>
        {BRAND_TIER_ORDER.map((tier) => (
          <Chip
            key={tier}
            selected={filters.brandTier === tier}
            onClick={() => set('brandTier', tier)}
          >
            {tierLabel(tier)}
          </Chip>
        ))}
      </FilterRow>

      <FilterRow label={strings.shop.filterCategory}>
        {CATEGORY_OPTIONS.map((cat) => (
          <Chip key={cat} selected={filters.category === cat} onClick={() => set('category', cat)}>
            {strings.closet.categoryLabel(cat)}
          </Chip>
        ))}
      </FilterRow>

      <FilterRow label={strings.shop.filterSize}>
        {SIZE_OPTIONS.map((size) => (
          <Chip key={size} selected={filters.size === size} onClick={() => set('size', size)}>
            {size}
          </Chip>
        ))}
      </FilterRow>

      {hasActiveFilters(filters) ? (
        <button type="button" style={clearStyle} onClick={() => onChange(EMPTY_FILTERS)}>
          <Text variant="ui" as="span" size="footnote" weight={600} style={{ color: 'var(--color-accent)' }}>{strings.shop.clearFilters}</Text>
        </button>
      ) : null}
    </div>
  );
}

/** A labelled, horizontally-scrolling row of chips. */
function FilterRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={rowStyle} role="group" aria-label={label}>
      <Text variant="ui" as="span" size="footnote" weight={600} style={{ flex: '0 0 auto', width: 'var(--space-16)', color: 'var(--color-secondary-strong)' }}>{label}</Text>
      <div style={chipsStyle}>{children}</div>
    </div>
  );
}

const containerStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-3)',
};

const rowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 'var(--space-3)',
};


const chipsStyle: CSSProperties = {
  display: 'flex',
  gap: 'var(--space-2)',
  overflowX: 'auto',
  paddingBottom: 'var(--space-1)',
};

const clearStyle: CSSProperties = {
  alignSelf: 'flex-start',
  border: 'none',
  background: 'transparent',
  padding: 0,
  cursor: 'pointer',
};
