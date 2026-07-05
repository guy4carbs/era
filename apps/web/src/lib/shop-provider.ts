/**
 * Server-only selection of the Shop product feed, plus the dormant live adapter.
 *
 * Shop runs on two paths behind one contract (`ShopProvider` from `@era/core/shop`):
 *   - the offline FIXTURE catalog is the LIVE path today — zero external calls, no
 *     key, fully browsable; and
 *   - a thin Sovrn Commerce network adapter, coded complete but DORMANT until a
 *     real `AFFILIATE_FEED_KEY` is provisioned.
 *
 * `getShopProvider()` is the single decision point. The adapter is engaged ONLY
 * when `AFFILIATE_PROVIDER === 'sovrn'` AND a real (non-placeholder) feed key is
 * present; anything else stays on the fixture. This mirrors Ovi's `isRealCredential`
 * gate: a placeholder key must never fire a request that can only fail.
 *
 * The affiliate key is server-only and is NEVER logged, echoed, or returned to a
 * client — the adapter reads it here and passes it in an Authorization header only.
 *
 * Never import this from a client bundle (it reads secrets from process.env).
 */
import {
  createFixtureShopProvider,
  type BrandTier,
  type ItemCategory,
  type ShopProduct,
  type ShopProvider,
  type ShopSearchQuery,
  type ShopSearchResult,
} from '@era/core/shop';

import { isHttpsUrl } from './shop-query.ts';

/**
 * True only for a real, operator-supplied affiliate key. The committed
 * `.env.example` ships an obvious `change-me-…` placeholder; treating that as
 * configured would fire an authenticated request that can only fail, so we reject
 * it and stay on the fixture. Same placeholder-guard idiom as `lib/auth.ts`.
 */
export function isRealCredential(value: string | undefined): value is string {
  if (!value) {
    return false;
  }
  return !value.startsWith('change-me') && !value.startsWith('sovrn-xxxx');
}

/**
 * The default Sovrn Commerce Product Search base. Pinned in code — never derived
 * from user input. `AFFILIATE_FEED_BASE_URL` overrides it for STAGING only.
 *
 * CONFIRM AT ONBOARDING: the exact host + path for the Sovrn Commerce product
 * search endpoint against the provisioned account (the documented base is
 * `https://api.sovrn.com` with a `/commerce/…` product-search path; the concrete
 * path is account/version specific).
 */
const DEFAULT_SOVRN_BASE_URL = 'https://api.sovrn.com';
/** Product-search path appended to the base. CONFIRM the exact path at onboarding. */
const SOVRN_SEARCH_PATH = '/commerce/v1/products/search';

/** Wall timeout for the upstream feed call — a slow feed must not hang a browse. */
const SOVRN_TIMEOUT_MS = 4000;
/** Result page size we request from the feed (mirrors the fixture PAGE_SIZE). */
const SOVRN_PAGE_SIZE = 20;

/**
 * Map a Sovrn product category string onto Era's 11-value `item_category`. This
 * map is OURS, not Sovrn's — a small, auditable lookup with a safe default so an
 * unmapped feed category never crashes a browse. CONFIRM the real Sovrn category
 * vocabulary at onboarding and extend this map.
 */
const SOVRN_CATEGORY_TO_ITEM: Readonly<Record<string, ItemCategory>> = {
  tops: 'top',
  shirts: 'top',
  't-shirts': 'top',
  sweaters: 'top',
  knitwear: 'top',
  bottoms: 'bottom',
  pants: 'bottom',
  trousers: 'bottom',
  jeans: 'bottom',
  skirts: 'bottom',
  dresses: 'dress',
  outerwear: 'outerwear',
  coats: 'outerwear',
  jackets: 'outerwear',
  shoes: 'shoes',
  footwear: 'shoes',
  boots: 'shoes',
  sneakers: 'shoes',
  bags: 'bag',
  handbags: 'bag',
  hats: 'hat',
  scarves: 'scarf',
  watches: 'watch',
  jewelry: 'jewelry',
  accessories: 'accessory',
};

/** Fallback category when a feed row's category is absent or unmapped. */
const DEFAULT_ITEM_CATEGORY: ItemCategory = 'accessory';

/**
 * Map a brand name onto a price/brand tier. This map is OURS — Sovrn does not
 * classify tier — so it is small, auditable, and defaults to `contemporary` for
 * any unknown brand. Extend as the merchant mix is known at onboarding.
 */
const BRAND_TO_TIER: Readonly<Record<string, BrandTier>> = {
  'the row': 'luxury',
  'loro piana': 'luxury',
  'bottega veneta': 'luxury',
  'saint laurent': 'luxury',
  prada: 'luxury',
  theory: 'premium',
  vince: 'premium',
  'a.p.c.': 'premium',
  'acne studios': 'premium',
  reiss: 'premium',
  cos: 'contemporary',
  sandro: 'contemporary',
  ganni: 'contemporary',
  everlane: 'contemporary',
  aritzia: 'contemporary',
  uniqlo: 'high_street',
  zara: 'high_street',
  'h&m': 'high_street',
  mango: 'high_street',
  gap: 'high_street',
};

/** Fallback tier for a brand not in {@link BRAND_TO_TIER}. */
const DEFAULT_BRAND_TIER: BrandTier = 'contemporary';

function brandTierFor(brand: string): BrandTier {
  return BRAND_TO_TIER[brand.trim().toLowerCase()] ?? DEFAULT_BRAND_TIER;
}

function itemCategoryFor(sovrnCategory: unknown): ItemCategory {
  if (typeof sovrnCategory !== 'string') {
    return DEFAULT_ITEM_CATEGORY;
  }
  return SOVRN_CATEGORY_TO_ITEM[sovrnCategory.trim().toLowerCase()] ?? DEFAULT_ITEM_CATEGORY;
}

/**
 * The shape we read off a Sovrn product row. Every field is optional/unknown at
 * the boundary — the feed is untrusted input, validated per-row in {@link toShopProduct}.
 *
 * CONFIRM AT ONBOARDING — the EXACT Sovrn field names below (these are the
 * best-documented guesses; the live payload is the source of truth):
 *   - title       ← product display name              (guess: `title`)
 *   - brand       ← brand/merchant name               (guess: `brand`)
 *   - price       ← numeric price                      (guess: `price` or `price.amount`)
 *   - currency    ← ISO currency                       (guess: `currency`)
 *   - imageUrl    ← primary image URL                  (guess: `imageUrl` or `image`)
 *   - retailer    ← selling merchant                   (guess: `merchant` or `retailer`)
 *   - productUrl  ← raw retailer product URL           (guess: `url` or `productUrl`)
 *   - affiliateUrl← Sovrn's ready-made monetised link  (guess: `affiliateUrl` or `redirectUrl`)
 *   - category    ← Sovrn category label               (guess: `category`)
 *   - inStock     ← availability flag                  (guess: `inStock` or `availability`)
 *   - id          ← stable product id                  (guess: `id` or `productId`)
 */
interface SovrnProductRow {
  readonly id?: unknown;
  readonly title?: unknown;
  readonly brand?: unknown;
  readonly price?: unknown;
  readonly currency?: unknown;
  readonly imageUrl?: unknown;
  readonly retailer?: unknown;
  readonly merchant?: unknown;
  readonly productUrl?: unknown;
  readonly url?: unknown;
  readonly affiliateUrl?: unknown;
  readonly redirectUrl?: unknown;
  readonly category?: unknown;
  readonly inStock?: unknown;
  readonly availability?: unknown;
}

/** A non-empty trimmed string, or null. */
function str(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/** A finite, non-negative number (coerces numeric strings), or null. */
function num(value: unknown): number | null {
  const n = typeof value === 'string' ? Number(value) : value;
  if (typeof n !== 'number' || !Number.isFinite(n) || n < 0) {
    return null;
  }
  return n;
}

/**
 * A row is in stock unless the feed explicitly says otherwise. Absent flags are
 * treated as available (the feed is a curated in-stock search); explicit false /
 * 'out_of_stock' / 'unavailable' drop the row.
 */
function isInStock(row: SovrnProductRow): boolean {
  if (row.inStock === false) {
    return false;
  }
  const availability = str(row.availability)?.toLowerCase();
  if (availability === 'out_of_stock' || availability === 'unavailable' || availability === 'outofstock') {
    return false;
  }
  return true;
}

/**
 * Map one untrusted Sovrn row to a `ShopProduct`, or null to DROP it. A row is
 * dropped when it is out of stock or missing any of the fields a card needs
 * (image, price, product url, affiliate url, title, brand).
 *
 * The affiliate URL is passed through UNTAMPERED — we take Sovrn's ready-made
 * monetised link exactly as returned and never string-munge it. Our sub-id is
 * supplied UPSTREAM via Sovrn's documented `cuid` request parameter (see
 * {@link buildSovrnSearchUrl}), so the link Sovrn returns already carries it.
 * This is the Ledger/Sentinel guarantee: Era does not rewrite payout links.
 *
 * Scheme-injection guard: the three URL fields must each be an absolute `https:`
 * URL. A hostile feed row returning e.g. `affiliateUrl: "javascript:…"` is DROPPED
 * rather than passed to the client, where it could execute in the era.style origin.
 */
function toShopProduct(row: SovrnProductRow): ShopProduct | null {
  if (!isInStock(row)) {
    return null;
  }
  const title = str(row.title);
  const brand = str(row.brand);
  const price = num(row.price);
  const currency = str(row.currency) ?? 'USD';
  const imageUrl = str(row.imageUrl);
  const productUrl = str(row.productUrl) ?? str(row.url);
  const affiliateUrl = str(row.affiliateUrl) ?? str(row.redirectUrl);
  const retailer = str(row.retailer) ?? str(row.merchant) ?? brand;

  if (!title || !brand || price === null || !imageUrl || !productUrl || !affiliateUrl || !retailer) {
    return null;
  }
  // Scheme-injection guard — never let a non-https link/image reach a rendered card.
  if (!isHttpsUrl(imageUrl) || !isHttpsUrl(productUrl) || !isHttpsUrl(affiliateUrl)) {
    return null;
  }

  const id = str(row.id) ?? affiliateUrl;
  return {
    id,
    title,
    brand,
    brandTier: brandTierFor(brand),
    category: itemCategoryFor(row.category),
    price,
    currency,
    imageUrl,
    retailer,
    productUrl,
    // UNTAMPERED — exactly as Sovrn returned it. Sub-id rides in via `cuid` upstream.
    affiliateUrl,
  };
}

/**
 * Build the Sovrn product-search URL from our query. Keywords come from `q`,
 * `category`, and `color`; the price band from `minPrice`/`maxPrice`; paging from
 * `page`. Our monetisation sub-id is attached ONLY through Sovrn's documented
 * `cuid` (custom-user-id) parameter — never by munging the returned link.
 *
 * CONFIRM AT ONBOARDING — the exact Sovrn request parameter names (`keywords`,
 * `minPrice`, `maxPrice`, `page`, `limit`, `cuid`) against the live API.
 */
function buildSovrnSearchUrl(baseUrl: string, query: ShopSearchQuery): string {
  const url = new URL(SOVRN_SEARCH_PATH, baseUrl);
  const keywords = [query.q, query.category].filter((part): part is string => typeof part === 'string' && part.length > 0);
  if (keywords.length > 0) {
    url.searchParams.set('keywords', keywords.join(' '));
  }
  if (query.minPrice !== undefined) {
    url.searchParams.set('minPrice', String(query.minPrice));
  }
  if (query.maxPrice !== undefined) {
    url.searchParams.set('maxPrice', String(query.maxPrice));
  }
  const page = query.page !== undefined && query.page >= 1 ? Math.floor(query.page) : 1;
  url.searchParams.set('page', String(page));
  url.searchParams.set('limit', String(SOVRN_PAGE_SIZE));
  // Era's stable sub-id for click attribution — Sovrn stamps it into the deep link.
  // CONFIRM: `cuid` is Sovrn's documented custom-user-id param.
  url.searchParams.set('cuid', 'era');
  return url.toString();
}

/** Coerce whatever the feed returns into an array of candidate rows. */
function extractRows(payload: unknown): SovrnProductRow[] {
  if (Array.isArray(payload)) {
    return payload as SovrnProductRow[];
  }
  if (payload && typeof payload === 'object') {
    const products = (payload as { products?: unknown }).products;
    if (Array.isArray(products)) {
      return products as SovrnProductRow[];
    }
  }
  return [];
}

/**
 * A `ShopProvider` backed by the Sovrn Commerce product feed. DORMANT until a
 * real key is provisioned. On any failure — non-200, timeout, network error,
 * malformed body — it returns an empty result and logs a key/PII-free warning;
 * it NEVER throws into the route (a browse degrades to "no picks", never a 500).
 */
export function createSovrnShopProvider(apiKey: string, baseUrl: string): ShopProvider {
  return {
    async search(query: ShopSearchQuery): Promise<ShopSearchResult> {
      const page = query.page !== undefined && query.page >= 1 ? Math.floor(query.page) : 1;
      const empty: ShopSearchResult = { products: [], page, hasMore: false };

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), SOVRN_TIMEOUT_MS);
      try {
        const response = await fetch(buildSovrnSearchUrl(baseUrl, query), {
          method: 'GET',
          headers: {
            // Server-only key — never logged, never returned to a client.
            // CONFIRM: Sovrn's auth scheme (Bearer vs. a custom header) at onboarding.
            Authorization: `Bearer ${apiKey}`,
            Accept: 'application/json',
          },
          signal: controller.signal,
        });
        if (!response.ok) {
          console.warn(`[shop-sovrn] feed returned status ${response.status}; returning no picks`);
          return empty;
        }
        const payload: unknown = await response.json().catch(() => null);
        const rows = extractRows(payload);
        const products = rows
          .map(toShopProduct)
          .filter((product): product is ShopProduct => product !== null);
        const hasMore = rows.length >= SOVRN_PAGE_SIZE;
        return { products, page, hasMore };
      } catch (error) {
        // No key, no PII — just the failure class, so a bad feed never leaks a secret.
        const reason = error instanceof Error ? error.name : 'unknown';
        console.warn(`[shop-sovrn] feed request failed (${reason}); returning no picks`);
        return empty;
      } finally {
        clearTimeout(timer);
      }
    },
  };
}

/**
 * The single decision point for which product feed Shop uses. Returns the Sovrn
 * adapter ONLY when the provider is explicitly selected AND a real feed key is
 * present; otherwise the offline fixture catalog (the live path today). Called
 * per-request by the shop routes — cheap, no I/O until `.search()` runs.
 */
export function getShopProvider(): ShopProvider {
  const provider = process.env.AFFILIATE_PROVIDER;
  const apiKey = process.env.AFFILIATE_FEED_KEY;
  if (provider === 'sovrn' && isRealCredential(apiKey)) {
    const baseUrl = process.env.AFFILIATE_FEED_BASE_URL || DEFAULT_SOVRN_BASE_URL;
    return createSovrnShopProvider(apiKey, baseUrl);
  }
  return createFixtureShopProvider();
}
