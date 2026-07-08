/**
 * @era/core — the Shop core. Client-safe types + pure logic for Era's Shop tab.
 *
 * Like Ovi, Shop runs on two paths behind one contract. A live network adapter
 * (Forge, dormant behind `AFFILIATE_FEED_KEY`) will fetch a real affiliate feed;
 * a deterministic ranker with a curated fixture catalog runs the whole tab today
 * with ZERO external calls and no Anthropic key. This module is that fixture +
 * deterministic path — the contract Forge codes the real adapter against and the
 * shape Nova (web) and Harbor (mobile) render.
 *
 * The hard rule Ovi lives by carries straight into Shop: shop the closet first.
 * The ranker rewards a product that fills a genuine gap or completes real looks
 * from owned pieces, and PENALISES a near-duplicate of something already owned —
 * and says so out loud via `similar_owned`. Honesty before a sale.
 *
 * No server-only imports live here (no DB client, no R2, no env reads), so this
 * subpath is safe in a client bundle. It reuses Ovi's styling primitives
 * (`slotForCategory`, `biggestEssentialGap`, palette matching) so Shop and Ovi
 * judge gaps, slots, and color identically.
 *
 * Import via the `@era/core/shop` subpath.
 */

import type { ItemCategory } from '@era/db';

import {
  biggestEssentialGap,
  buildPaletteSet,
  normalizeColor,
  slotForCategory,
  type OviItem,
  type StyleProfileLite,
} from './ovi.ts';

// -----------------------------------------------------------------------------
// Contract types — the pinned surface Forge, Nova, and Harbor code against
// -----------------------------------------------------------------------------

/** Retailer price band. Drives the tier filter and, loosely, the price spread. */
export type BrandTier = 'luxury' | 'premium' | 'contemporary' | 'high_street';

/** The 11-value garment category, reused from `@era/db`'s `item_category` enum. */
export type { ItemCategory };

/**
 * A single shoppable product. `productUrl` is the raw retailer link; `affiliateUrl`
 * is our monetised deep-link (fixtures use a placeholder `?aff=era-<tag>` — the
 * real adapter mints signed links). Image-forward and self-describing so both
 * platforms can render a card without a second lookup.
 */
export interface ShopProduct {
  readonly id: string;
  readonly title: string;
  readonly brand: string;
  readonly brandTier: BrandTier;
  readonly category: ItemCategory;
  readonly price: number;
  readonly currency: string;
  readonly imageUrl: string;
  readonly retailer: string;
  readonly productUrl: string;
  readonly affiliateUrl: string;
  readonly sizes?: readonly string[];
  readonly colors?: readonly string[];
}

/** The query a provider filters against. All fields optional; absent = no filter. */
export interface ShopSearchQuery {
  readonly q?: string;
  readonly category?: ItemCategory;
  readonly brandTier?: BrandTier;
  readonly minPrice?: number;
  readonly maxPrice?: number;
  readonly size?: string;
  readonly page?: number;
}

/** One page of provider results, plus whether another page follows. */
export interface ShopSearchResult {
  readonly products: readonly ShopProduct[];
  readonly page: number;
  readonly hasMore: boolean;
}

/**
 * Why the ranker surfaced a product, at most one per product. `completes_outfits`
 * and `fills_gap` are positive pulls; `similar_owned` is an HONEST warning that
 * the user may already own something like this — the trust rule, made visible.
 */
export type ProductWhy =
  | { readonly kind: 'completes_outfits'; readonly count: number }
  | { readonly kind: 'fills_gap'; readonly category: ItemCategory }
  | { readonly kind: 'similar_owned'; readonly ownedCount: number };

/**
 * A pointer to ONE owned closet item behind a `why` signal. `id` is the owned
 * {@link OviItem.id}; `label` is a short human tag built from the owned piece
 * (e.g. `"indigo bottom"` or `"A.P.C. top"`) so a detail sheet can name it
 * without a second lookup. `imageUrl` is deliberately left UNDEFINED here — this
 * subpath is client-safe and never touches the DB or R2, so the SERVER resolves
 * each item's cutout URL from the DB before returning the payload to the client.
 */
export interface WhyItemRef {
  readonly id: string;
  readonly label: string;
  readonly imageUrl?: string;
}

/**
 * The identities behind a product's `why` — the ACTUAL owned pieces each signal
 * rests on, for a rich "why" detail view. Where {@link ProductWhy} collapses to a
 * single count-only label (kept as-is for backward-compat), this surfaces the
 * closet items themselves. Each array is capped at {@link WHY_DETAIL_CAP} items in
 * stable closet order to keep the payload small.
 *   - `completesWith` — owned pieces that form buildable looks with the product
 *     (empty for a self-anchoring dress, which needs no owned piece).
 *   - `fillsGap` — the gap category this product fills plus how many the user
 *     already owns in it; `null` when the product doesn't fill the biggest gap.
 *   - `similarTo` — owned near-duplicates (same category, shared color): the
 *     honest "you may already own this" warning, made concrete.
 *   - `paletteMatch` — the product colors that land in the profile palette.
 */
export interface WhyDetail {
  readonly completesWith: readonly WhyItemRef[];
  readonly fillsGap: { readonly category: ItemCategory; readonly ownedCount: number } | null;
  readonly similarTo: readonly WhyItemRef[];
  readonly paletteMatch: readonly string[];
}

/**
 * A product plus its deterministic score, its single most salient `why` label,
 * and the rich `whyDetail` naming the owned items behind each signal (`null` when
 * no signal names any closet item). `why` stays the compact count-only label the
 * rec-event route and `WhyLabel` depend on; `whyDetail` is the additive parallel.
 */
export interface RankedProduct extends ShopProduct {
  readonly score: number;
  readonly why: ProductWhy | null;
  readonly whyDetail: WhyDetail | null;
}

/**
 * A saved (wishlist / save-for-later) product, in a render-friendly shape close
 * to {@link ShopProduct} so Nova (web) and Harbor (mobile) render a saved card
 * with the same components they use for a browse card. It is the mapped view of a
 * `saved_products` row — a denormalized snapshot captured at save time (Shop feeds
 * have no table to FK to), so `brand`, `category`, and `imageUrl` are nullable
 * exactly as the row stores them. `id` is the external `ShopProduct.id` (the row's
 * `productId`, the stable feed key an unsave targets); `price` is the numeric
 * `priceSnapshot` coerced back to a number. Returned newest-first by `/api/shop/saved`.
 */
export interface SavedShopProduct {
  readonly id: string;
  readonly title: string;
  readonly brand: string | null;
  readonly category: ItemCategory | null;
  readonly price: number;
  readonly currency: string;
  readonly imageUrl: string | null;
  readonly retailer: string;
  readonly productUrl: string;
  readonly affiliateUrl: string;
}

/**
 * The swappable feed. The fixture provider is the live path today; the real
 * network adapter (dormant behind `AFFILIATE_FEED_KEY`) implements the same
 * interface and swaps in with no change to routes or UI.
 */
export interface ShopProvider {
  search(query: ShopSearchQuery): Promise<ShopSearchResult>;
}

// -----------------------------------------------------------------------------
// Fixture catalog — a curated, cross-brand set so Shop is fully browsable with
// ZERO external calls. Real-ish brands across every tier and every category,
// a $30–$1200 spread, sizes and garment colors. Authored as compact tuples and
// expanded into ShopProducts so the catalog reads as data, not boilerplate.
// -----------------------------------------------------------------------------

const APPAREL_SIZES = ['XS', 'S', 'M', 'L', 'XL'] as const;
const DENIM_SIZES = ['24', '26', '28', '30', '32'] as const;
const SHOE_SIZES = ['37', '38', '39', '40', '41', '42'] as const;
const BELT_SIZES = ['S', 'M', 'L'] as const;
const ONE_SIZE = ['One Size'] as const;

/** `[brand, tier, category, title, price, colors, sizes]` — currency is USD. */
type FixtureTuple = readonly [
  brand: string,
  tier: BrandTier,
  category: ItemCategory,
  title: string,
  price: number,
  colors: readonly string[],
  sizes: readonly string[],
];

const FIXTURE_TUPLES: readonly FixtureTuple[] = [
  // --- luxury ---------------------------------------------------------------
  ['The Row', 'luxury', 'top', 'Wool-Silk Boxy Tee', 590, ['ecru'], APPAREL_SIZES],
  ['The Row', 'luxury', 'bottom', 'Relaxed Wool Trouser', 890, ['black'], APPAREL_SIZES],
  ['The Row', 'luxury', 'dress', 'Column Silk Dress', 1190, ['black'], APPAREL_SIZES],
  ['Loro Piana', 'luxury', 'outerwear', 'Cashmere Overcoat', 1200, ['camel'], APPAREL_SIZES],
  ['Loro Piana', 'luxury', 'hat', 'Cashmere Ribbed Beanie', 425, ['grey'], ONE_SIZE],
  ['Loro Piana', 'luxury', 'scarf', 'Fringed Cashmere Scarf', 520, ['oatmeal'], ONE_SIZE],
  ['Bottega Veneta', 'luxury', 'bag', 'Intrecciato Leather Tote', 1150, ['tan'], ONE_SIZE],
  ['Saint Laurent', 'luxury', 'shoes', 'Leather Ankle Boot', 995, ['black'], SHOE_SIZES],
  ['Prada', 'luxury', 'accessory', 'Saffiano Leather Belt', 620, ['black'], BELT_SIZES],
  ['Tudor', 'luxury', 'watch', 'Steel Automatic Watch', 1200, ['silver'], ONE_SIZE],
  ['Sophie Buhai', 'luxury', 'jewelry', 'Silver Chain Necklace', 640, ['silver'], ONE_SIZE],

  // --- premium --------------------------------------------------------------
  ['Theory', 'premium', 'top', 'Silk Shell Top', 245, ['ivory'], APPAREL_SIZES],
  ['Theory', 'premium', 'bottom', 'Tailored Wool Trouser', 325, ['charcoal'], APPAREL_SIZES],
  ['Vince', 'premium', 'top', 'Cashmere Crew Sweater', 285, ['navy'], APPAREL_SIZES],
  ['Vince', 'premium', 'dress', 'Draped Midi Dress', 395, ['black'], APPAREL_SIZES],
  ['A.P.C.', 'premium', 'bottom', 'Petit New Standard Jean', 210, ['indigo'], DENIM_SIZES],
  ['A.P.C.', 'premium', 'bag', 'Half-Moon Leather Bag', 450, ['black'], ONE_SIZE],
  ['Acne Studios', 'premium', 'outerwear', 'Wool-Blend Belted Coat', 850, ['grey'], APPAREL_SIZES],
  ['Acne Studios', 'premium', 'scarf', 'Oversized Fringe Scarf', 220, ['pink'], ONE_SIZE],
  ['Reiss', 'premium', 'top', 'Slim Cotton Shirt', 165, ['white'], APPAREL_SIZES],
  ['Reiss', 'premium', 'shoes', 'Leather Penny Loafer', 240, ['brown'], SHOE_SIZES],

  // --- contemporary ---------------------------------------------------------
  ['COS', 'contemporary', 'top', 'Boxy Cotton T-Shirt', 45, ['white'], APPAREL_SIZES],
  ['COS', 'contemporary', 'bottom', 'Wide-Leg Twill Trouser', 135, ['stone'], APPAREL_SIZES],
  ['COS', 'contemporary', 'outerwear', 'Cotton Twill Overshirt', 175, ['olive'], APPAREL_SIZES],
  ['Sandro', 'contemporary', 'dress', 'Pleated Mini Dress', 395, ['black'], APPAREL_SIZES],
  ['Sandro', 'contemporary', 'top', 'Wool Knit Cardigan', 285, ['cream'], APPAREL_SIZES],
  ['Ganni', 'contemporary', 'dress', 'Floral Wrap Midi Dress', 345, ['floral'], APPAREL_SIZES],
  ['Ganni', 'contemporary', 'shoes', 'Chunky Ankle Boot', 415, ['black'], SHOE_SIZES],
  ['Everlane', 'contemporary', 'top', 'The Cotton Crew', 50, ['heather grey'], APPAREL_SIZES],
  ['Everlane', 'contemporary', 'bottom', 'The Way-High Jean', 98, ['washed black'], DENIM_SIZES],
  ['Everlane', 'contemporary', 'outerwear', 'ReNew Long Puffer', 168, ['navy'], APPAREL_SIZES],
  ['Aritzia', 'contemporary', 'bottom', 'Effortless Wide Pant', 128, ['taupe'], APPAREL_SIZES],
  ['Aritzia', 'contemporary', 'top', 'Contour Long-Sleeve', 45, ['black'], APPAREL_SIZES],
  ['Mejuri', 'contemporary', 'jewelry', 'Bold Gold Hoop Earrings', 120, ['gold'], ONE_SIZE],
  ['Mejuri', 'contemporary', 'watch', 'Minimal Mesh Watch', 165, ['gold'], ONE_SIZE],

  // --- high street ----------------------------------------------------------
  ['Uniqlo', 'high_street', 'top', 'Supima Cotton Crew Tee', 30, ['white'], APPAREL_SIZES],
  ['Uniqlo', 'high_street', 'bottom', 'Smart Ankle Pant', 50, ['black'], APPAREL_SIZES],
  ['Uniqlo', 'high_street', 'outerwear', 'Ultra Light Down Jacket', 70, ['navy'], APPAREL_SIZES],
  ['Uniqlo', 'high_street', 'accessory', 'Leather Touch Gloves', 30, ['black'], BELT_SIZES],
  ['Zara', 'high_street', 'dress', 'Satin Slip Dress', 60, ['champagne'], APPAREL_SIZES],
  ['Zara', 'high_street', 'top', 'Cotton Poplin Shirt', 40, ['blue'], APPAREL_SIZES],
  ['Zara', 'high_street', 'shoes', 'Heeled Leather Mule', 70, ['beige'], SHOE_SIZES],
  ['H&M', 'high_street', 'top', 'Ribbed Tank Top', 30, ['black'], APPAREL_SIZES],
  ['H&M', 'high_street', 'bottom', 'Wide Twill Trousers', 35, ['khaki'], APPAREL_SIZES],
  ['H&M', 'high_street', 'accessory', 'Braided Leather Belt', 30, ['brown'], BELT_SIZES],
  ['Mango', 'high_street', 'dress', 'Linen Shirt Dress', 80, ['ecru'], APPAREL_SIZES],
  ['Mango', 'high_street', 'bag', 'Croc-Effect Crossbody', 60, ['black'], ONE_SIZE],
  ['Mango', 'high_street', 'hat', 'Wool Felt Fedora', 46, ['camel'], ONE_SIZE],
  ['Gap', 'high_street', 'bottom', 'Vintage Slim Jean', 80, ['mid wash'], DENIM_SIZES],
  ['Gap', 'high_street', 'top', 'Organic Cotton Crew', 40, ['forest'], APPAREL_SIZES],
  ['Gap', 'high_street', 'scarf', 'Brushed Plaid Scarf', 35, ['grey'], ONE_SIZE],
];

/** Slug a brand or title into a URL- and id-safe token. */
function slug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Expand one fixture tuple into a fully-formed ShopProduct with placeholder urls. */
function toProduct(tuple: FixtureTuple): ShopProduct {
  const [brand, brandTier, category, title, price, colors, sizes] = tuple;
  const retailerSlug = slug(brand);
  const id = `${retailerSlug}-${slug(title)}`;
  const productUrl = `https://${retailerSlug}.example/p/${id}`;
  return {
    id,
    title,
    brand,
    brandTier,
    category,
    price,
    currency: 'USD',
    imageUrl: `https://images.${retailerSlug}.example/${id}.jpg`,
    retailer: brand,
    productUrl,
    // Placeholder monetised link — the real adapter mints signed deep-links.
    affiliateUrl: `${productUrl}?aff=era-${retailerSlug}`,
    sizes,
    colors,
  };
}

/** The curated catalog, expanded once at module load. */
const FIXTURE_CATALOG: readonly ShopProduct[] = FIXTURE_TUPLES.map(toProduct);

/** Page size for the fixture provider (matches the intended real-adapter page). */
const PAGE_SIZE = 20;

/** True when the product satisfies every set filter in the query. */
function matchesQuery(product: ShopProduct, query: ShopSearchQuery): boolean {
  if (query.category !== undefined && product.category !== query.category) {
    return false;
  }
  if (query.brandTier !== undefined && product.brandTier !== query.brandTier) {
    return false;
  }
  if (query.minPrice !== undefined && product.price < query.minPrice) {
    return false;
  }
  if (query.maxPrice !== undefined && product.price > query.maxPrice) {
    return false;
  }
  if (query.q !== undefined && query.q.trim().length > 0) {
    const needle = query.q.trim().toLowerCase();
    const haystack = `${product.title} ${product.brand}`.toLowerCase();
    if (!haystack.includes(needle)) {
      return false;
    }
  }
  if (query.size !== undefined && query.size.trim().length > 0) {
    const wanted = query.size.trim().toLowerCase();
    const has = (product.sizes ?? []).some((s) => s.toLowerCase() === wanted);
    if (!has) {
      return false;
    }
  }
  return true;
}

/**
 * A `ShopProvider` backed by the curated fixture catalog. Filters by the query
 * and paginates (1-based `page`, {@link PAGE_SIZE} per page). Fully offline — no
 * network, no key — so the Shop tab is browsable and demoable today. Async to
 * match the real adapter's signature exactly.
 */
export function createFixtureShopProvider(): ShopProvider {
  return {
    search(query: ShopSearchQuery): Promise<ShopSearchResult> {
      const filtered = FIXTURE_CATALOG.filter((p) => matchesQuery(p, query));
      const page = query.page !== undefined && query.page >= 1 ? Math.floor(query.page) : 1;
      const start = (page - 1) * PAGE_SIZE;
      const products = filtered.slice(start, start + PAGE_SIZE);
      const hasMore = filtered.length > start + PAGE_SIZE;
      return Promise.resolve({ products, page, hasMore });
    },
  };
}

/** The curated fixture catalog, exposed for tests and offline tooling. */
export function fixtureCatalog(): readonly ShopProduct[] {
  return FIXTURE_CATALOG;
}

// -----------------------------------------------------------------------------
// Canonical filter facets — ONE source of truth for the Shop filter controls so
// web and mobile render identical budget bands, size chips, and tier order.
// Nova (web) and Harbor (mobile) import these; neither hand-rolls its own set.
// Client-safe — no server imports reach this subpath.
// -----------------------------------------------------------------------------

/** A budget filter chip. `minPrice`/`maxPrice` map straight onto a ShopSearchQuery. */
export interface BudgetBand {
  readonly id: string;
  readonly label: string;
  readonly minPrice?: number;
  readonly maxPrice?: number;
}

/**
 * The ordered budget bands, cheapest first. Each price bound maps directly onto
 * {@link ShopSearchQuery}'s inclusive `minPrice`/`maxPrice`. The bands tile the
 * $30–$1200 catalog with no overlap: a band's `maxPrice` sits one dollar below
 * the next band's `minPrice`, so an item falls into exactly one band (the upper
 * round number belongs to the higher band — e.g. a $150 piece is in `$150–$400`).
 */
export const BUDGET_BANDS: readonly BudgetBand[] = [
  { id: 'under-50', label: 'Under $50', maxPrice: 49 },
  { id: '50-150', label: '$50–$150', minPrice: 50, maxPrice: 149 },
  { id: '150-400', label: '$150–$400', minPrice: 150, maxPrice: 399 },
  { id: 'over-400', label: '$400+', minPrice: 400 },
];

/**
 * The canonical, ordered size chips — the union of every size the fixture catalog
 * actually carries, so every chip yields results: apparel (XS–XL), denim waist
 * (24–32), a EU shoe subset (37–42), and `One Size` for accessories/bags/hats.
 * This replaces mobile's free-text size box — both platforms render the same
 * presets. Composed from the catalog's own size sets to stay in lockstep.
 */
export const SIZE_OPTIONS: readonly string[] = [
  ...APPAREL_SIZES,
  ...DENIM_SIZES,
  ...SHOE_SIZES,
  ...ONE_SIZE,
];

/**
 * The fixed order of brand-tier chips, most exclusive first, so both platforms
 * present the tier filter identically.
 */
export const BRAND_TIER_ORDER: readonly BrandTier[] = [
  'luxury',
  'premium',
  'contemporary',
  'high_street',
];

/**
 * Resolve a budget band id to the price bounds a {@link ShopSearchQuery} takes.
 * An unknown id yields `{}` (no price filter) so a stale chip degrades to "all
 * prices" rather than erroring. Only the bounds a band sets are returned.
 */
export function budgetBandToQuery(bandId: string): { minPrice?: number; maxPrice?: number } {
  const band = BUDGET_BANDS.find((b) => b.id === bandId);
  if (band === undefined) {
    return {};
  }
  const query: { minPrice?: number; maxPrice?: number } = {};
  if (band.minPrice !== undefined) {
    query.minPrice = band.minPrice;
  }
  if (band.maxPrice !== undefined) {
    query.maxPrice = band.maxPrice;
  }
  return query;
}

// -----------------------------------------------------------------------------
// Deterministic ranker — the 'why' engine when the Anthropic path is dormant.
// Pure, total, and unit-tested. Reuses Ovi's gap/slot/palette primitives so the
// two surfaces reason about the closet the same way.
// -----------------------------------------------------------------------------

/** Score weights. Gap dominates; a near-duplicate warning is a real demotion. */
const WEIGHT_FILLS_GAP = 10;
const WEIGHT_PALETTE = 2;
const WEIGHT_PER_COMPLETED_LOOK = 1;
const PENALTY_SIMILAR_OWNED = 5;

/**
 * How many buildable looks the product forms with owned pieces. A look needs a
 * base (top or dress) and a bottom, unless the base is a dress (self-anchoring).
 * Reuses {@link slotForCategory} for the product's role:
 *   - a top pairs with each owned bottom            → #bottoms
 *   - a bottom pairs with each owned top             → #tops
 *   - a dress is a complete look on its own          → 1
 *   - shoes/outerwear/accessory finish the looks the closet can already anchor
 *     (owned dresses + owned top×bottom pairs)       → #anchors
 * A category that can't enter a look scores 0.
 */
/** A completable-looks tally plus the owned pieces that make those looks buildable. */
interface CompletableLooks {
  readonly count: number;
  /** The owned items that contribute a buildable look (stable closet order). */
  readonly contributors: readonly OviItem[];
}

function completableLooks(product: ShopProduct, closet: readonly OviItem[]): CompletableLooks {
  const slot = slotForCategory(product.category);
  if (slot === null) {
    return { count: 0, contributors: [] };
  }
  const tops = closet.filter((i) => i.category === 'top');
  const bottoms = closet.filter((i) => i.category === 'bottom');
  const dresses = closet.filter((i) => i.category === 'dress');

  if (product.category === 'dress') {
    // A dress is a complete look on its own — no owned piece is required, so
    // there are no contributors to name.
    return { count: 1, contributors: [] };
  }
  if (slot === 'base') {
    // A top: buildable with each owned bottom.
    return { count: bottoms.length, contributors: bottoms };
  }
  if (slot === 'bottom') {
    return { count: tops.length, contributors: tops };
  }
  // Optional slots (shoes, outerwear, accessory): finish looks the closet can
  // already anchor — each owned dress, and each owned top×bottom pairing. The
  // contributing pieces are the anchors: every dress, plus tops and bottoms —
  // but tops only complete a look when a bottom exists to pair with, and vice
  // versa, so each is a contributor only when the other side is non-empty.
  const count = dresses.length + tops.length * bottoms.length;
  const contributors: OviItem[] = [
    ...dresses,
    ...(bottoms.length > 0 ? tops : []),
    ...(tops.length > 0 ? bottoms : []),
  ];
  return { count, contributors };
}

/**
 * How many owned pieces are a near-duplicate of the product: same category AND
 * at least one shared (normalized) color. The honest signal behind the trust
 * rule — the ranker won't quietly push something you already own.
 */
function similarOwned(product: ShopProduct, closet: readonly OviItem[]): readonly OviItem[] {
  const productColors = new Set((product.colors ?? []).map(normalizeColor));
  if (productColors.size === 0) {
    return [];
  }
  return closet.filter(
    (i) => i.category === product.category && i.colors.some((c) => productColors.has(normalizeColor(c))),
  );
}

/**
 * The product colors (original spelling) that land in the profile palette, deduped
 * by normalized value in first-seen order. Surfaces {@link colorsMatchPalette}'s
 * hits, which the boolean form otherwise throws away.
 */
function paletteMatchColors(product: ShopProduct, palette: ReadonlySet<string>): readonly string[] {
  const seen = new Set<string>();
  const hits: string[] = [];
  for (const color of product.colors ?? []) {
    const norm = normalizeColor(color);
    if (palette.has(norm) && !seen.has(norm)) {
      seen.add(norm);
      hits.push(color);
    }
  }
  return hits;
}

/** Max owned items surfaced per `whyDetail` array — keeps the payload small. */
const WHY_DETAIL_CAP = 3;

/**
 * A short human label for an owned closet piece — primary color + category
 * (`"indigo bottom"`), falling back to brand + category, then bare category. Kept
 * simple and color-forward so a "completes with your ___" line reads naturally.
 */
function whyItemLabel(item: OviItem): string {
  const descriptor = item.colors[0] ?? item.brand ?? undefined;
  return descriptor !== undefined && descriptor.length > 0 ? `${descriptor} ${item.category}` : item.category;
}

/**
 * Project an owned item to a {@link WhyItemRef}. `imageUrl` is intentionally
 * omitted — the server resolves the cutout URL from the DB (see WhyItemRef).
 */
function toWhyItemRef(item: OviItem): WhyItemRef {
  return { id: item.id, label: whyItemLabel(item) };
}

/**
 * Rank a set of products against the user's closet and style profile. Pure and
 * deterministic — the live ranking today, and the exact fallback when the
 * `rank-products` LLM route is dormant.
 *
 * For each product:
 *   - `fills_gap` (+{@link WEIGHT_FILLS_GAP}) when its category is the closet's
 *     biggest missing essential (Ovi's {@link biggestEssentialGap}).
 *   - `completes_outfits` (+{@link WEIGHT_PER_COMPLETED_LOOK} per look) from
 *     {@link completableLooks}.
 *   - palette match (+{@link WEIGHT_PALETTE}) when a product color is in the
 *     profile palette.
 *   - `similar_owned` (−{@link PENALTY_SIMILAR_OWNED}) when the user already owns
 *     a same-category, same-color piece — a demotion, not a boost.
 *
 * The single surfaced `why` is chosen by salience: `fills_gap` first (the
 * strongest reason to buy), then `similar_owned` (honesty — the warning is
 * surfaced even when the product also completes looks), then `completes_outfits`,
 * else none. Results are sorted by score descending; input order breaks ties.
 */
export function rankProducts(
  products: readonly ShopProduct[],
  closet: readonly OviItem[],
  styleProfile: StyleProfileLite | null,
): RankedProduct[] {
  const palette = buildPaletteSet(styleProfile?.palette ?? []);
  // No closet means no honest gap to name — everything is missing, so we don't
  // single one category out. Ovi's whats_missing stays silent on an empty closet
  // for the same reason.
  const gap = closet.length > 0 ? biggestEssentialGap(closet) : null;

  const ranked = products.map((product): RankedProduct => {
    // Compute each signal ONCE, keeping the owned-item identities alongside the
    // counts so the compact `why` label and the rich `whyDetail` stay in lockstep.
    const paletteHits = paletteMatchColors(product, palette);
    const paletteMatch = paletteHits.length > 0;
    const fillsGap = gap !== null && product.category === gap;
    const looks = completableLooks(product, closet);
    const completes = looks.count;
    const similarItems = similarOwned(product, closet);
    const similar = similarItems.length;

    let score = 0;
    if (fillsGap) score += WEIGHT_FILLS_GAP;
    if (paletteMatch) score += WEIGHT_PALETTE;
    score += completes * WEIGHT_PER_COMPLETED_LOOK;
    if (similar > 0) score -= PENALTY_SIMILAR_OWNED;

    let why: ProductWhy | null = null;
    if (fillsGap) {
      why = { kind: 'fills_gap', category: product.category };
    } else if (similar > 0) {
      // Honesty first: surface the near-duplicate warning even if the product
      // would also complete outfits.
      why = { kind: 'similar_owned', ownedCount: similar };
    } else if (completes > 0) {
      why = { kind: 'completes_outfits', count: completes };
    }

    // The parallel rich detail — the ACTUAL owned pieces behind each signal, each
    // array capped and in stable closet order. `fillsGap` reports the gap category
    // and how many the user already owns in it. `null` when no signal names any
    // owned item (the compact `why` may still carry a count-only label, e.g. a
    // self-anchoring dress that completes a look with no owned contributor).
    const completesWith = looks.contributors.slice(0, WHY_DETAIL_CAP).map(toWhyItemRef);
    const similarTo = similarItems.slice(0, WHY_DETAIL_CAP).map(toWhyItemRef);
    const paletteMatched = paletteHits.slice(0, WHY_DETAIL_CAP);
    const gapDetail = fillsGap
      ? {
          category: product.category,
          ownedCount: closet.filter((i) => i.category === product.category).length,
        }
      : null;
    const hasDetail =
      completesWith.length > 0 || gapDetail !== null || similarTo.length > 0 || paletteMatched.length > 0;
    const whyDetail: WhyDetail | null = hasDetail
      ? { completesWith, fillsGap: gapDetail, similarTo, paletteMatch: paletteMatched }
      : null;

    return { ...product, score, why, whyDetail };
  });

  return ranked.sort((a, b) => b.score - a.score);
}

// -----------------------------------------------------------------------------
// Wardrobe-gap engine — the honest "what's worth shopping for" counterpart to
// the ranker above. Re-exported here so a caller gets gaps and product ranking
// from the one `@era/core/shop` import; also available via `@era/core/wardrobe-gaps`.
// -----------------------------------------------------------------------------

export { findWardrobeGaps } from './wardrobe-gaps.ts';
export type { WardrobeGap } from './wardrobe-gaps.ts';
