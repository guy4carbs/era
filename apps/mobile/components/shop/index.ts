/** Shop tab components + API. */
export { ShopCard, type ShopCardProduct } from './ShopCard';
export { ShopFilters } from './ShopFilters';
export { WhyLabel } from './WhyLabel';
export { WhyDetailSheet } from './WhyDetailSheet';
export { GapsHero } from './GapsHero';
export {
  getWardrobeGaps,
  listSaved,
  logRecEvent,
  rankProducts,
  saveProduct,
  searchProducts,
  unsaveProduct,
  type RecEvent,
  type RecEventKind,
  type SavedShopProduct,
} from './api';
export {
  EMPTY_FILTERS,
  filtersFromQuery,
  hasActiveFilters,
  toSearchQuery,
  type ShopFilterState,
} from './filters';
export { brandTierLabel, formatPrice, resolveWhy, type WhyDisplay } from './labels';
