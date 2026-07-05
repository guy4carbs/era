/** Shop tab components + API. */
export { ShopCard } from './ShopCard';
export { ShopFilters } from './ShopFilters';
export { WhyLabel } from './WhyLabel';
export {
  logRecEvent,
  rankProducts,
  searchProducts,
  type RecEvent,
  type RecEventKind,
} from './api';
export {
  BRAND_TIERS,
  BUDGET_BANDS,
  budgetBandLabel,
  EMPTY_FILTERS,
  hasActiveFilters,
  toSearchQuery,
  type BudgetBand,
  type ShopFilterState,
} from './filters';
export { brandTierLabel, formatPrice, resolveWhy, type WhyDisplay } from './labels';
