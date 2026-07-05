/**
 * Shared request-parsing for the Shop routes. The same-origin guard is common to
 * all three (`/api/shop-search`, `/api/rank-products`, `/api/shop/rec-event`); the
 * capped body reader + `ShopSearchQuery` parser back the browse route
 * (`/api/shop-search`), where they live once so the abuse guards and the
 * enum/price rules are audited in a single place. (`/api/rank-products` takes a
 * `{ products }` body and validates it against Oracle's `ShopProduct` shape.)
 *
 * Pure validation + header checks only — no DB, no provider, no secrets — but it
 * is server-side (imported by route handlers, never a client bundle).
 */
import { type BrandTier, type ItemCategory, type ShopProduct, type ShopSearchQuery } from '@era/core/shop';

/** A search body is small; cap it well below anything a real query needs. */
export const MAX_SHOP_BODY_BYTES = 2048;
/** Bound the free-text query and size token (Sentinel LOW: bound handled text). */
const MAX_Q_CHARS = 120;
const MAX_SIZE_CHARS = 20;
/** Price ceiling — a sane upper bound so a bogus band can't be requested. */
const MAX_PRICE = 1_000_000;

/** The 11-value item_category enum, mirrored for validation. */
const ITEM_CATEGORIES: readonly ItemCategory[] = [
  'top',
  'bottom',
  'dress',
  'outerwear',
  'shoes',
  'bag',
  'hat',
  'scarf',
  'watch',
  'jewelry',
  'accessory',
];

/** The 4-value brand tier enum, mirrored for validation. */
const BRAND_TIERS: readonly BrandTier[] = ['luxury', 'premium', 'contemporary', 'high_street'];

/** A non-empty string, else null. */
function nonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

/** An optional readonly string array (all entries strings), else undefined. */
function optionalStringArray(value: unknown): readonly string[] | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (!Array.isArray(value) || !value.every((entry) => typeof entry === 'string')) {
    return undefined;
  }
  return value as string[];
}

/**
 * Validate one untrusted value into a `ShopProduct`, or null when malformed. The
 * ONE audited product validator, shared by `/api/rank-products` (a page of
 * client-forwarded products) and `/api/shop/save` (the product to persist).
 * Requires every card field: ids/strings non-empty, the two enums in range, and a
 * finite non-negative price. `sizes`/`colors` are optional.
 *
 * The link/image fields (`imageUrl`, `productUrl`, `affiliateUrl`) MUST be
 * absolute `https:` URLs (see {@link isHttpsUrl}) — these products are
 * CLIENT-SUPPLIED, so a tampered `javascript:`/`data:` URL must never pass
 * validation and reach a rendered `href`/`<img src>` (or get persisted).
 */
export function parseShopProduct(value: unknown): ShopProduct | null {
  if (typeof value !== 'object' || value === null) {
    return null;
  }
  const p = value as Record<string, unknown>;

  const id = nonEmptyString(p.id);
  const title = nonEmptyString(p.title);
  const brand = nonEmptyString(p.brand);
  const currency = nonEmptyString(p.currency);
  const imageUrl = nonEmptyString(p.imageUrl);
  const retailer = nonEmptyString(p.retailer);
  const productUrl = nonEmptyString(p.productUrl);
  const affiliateUrl = nonEmptyString(p.affiliateUrl);
  if (!id || !title || !brand || !currency || !imageUrl || !retailer || !productUrl || !affiliateUrl) {
    return null;
  }
  if (!ITEM_CATEGORIES.includes(p.category as ItemCategory)) {
    return null;
  }
  if (!BRAND_TIERS.includes(p.brandTier as BrandTier)) {
    return null;
  }
  if (typeof p.price !== 'number' || !Number.isFinite(p.price) || p.price < 0) {
    return null;
  }
  if (!isHttpsUrl(imageUrl) || !isHttpsUrl(productUrl) || !isHttpsUrl(affiliateUrl)) {
    return null;
  }

  return {
    id,
    title,
    brand,
    brandTier: p.brandTier as BrandTier,
    category: p.category as ItemCategory,
    price: p.price,
    currency,
    imageUrl,
    retailer,
    productUrl,
    affiliateUrl,
    sizes: optionalStringArray(p.sizes),
    colors: optionalStringArray(p.colors),
  };
}

/**
 * Same-origin guard for a mutating POST (same idiom as api/shop-search and
 * api/delete-account). A browser must send an Origin whose host matches the
 * request host; a missing Origin (non-browser client) is allowed — the session
 * gate is the real authorization.
 */
export function isSameOrigin(request: Request): boolean {
  const origin = request.headers.get('origin');
  if (!origin) return true;
  const host = request.headers.get('host');
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

/**
 * Scheme-injection guard: true ONLY for a well-formed absolute `https:` URL.
 * Product link/image fields (`affiliateUrl`, `productUrl`, `imageUrl`) MUST pass
 * this before they can reach the client — a hostile affiliate-feed row or a
 * tampered client-supplied product could otherwise smuggle a `javascript:` /
 * `data:` / `tel:` URL into a rendered `href` or `<img src>` (React 19 renders
 * `javascript:` hrefs, dev-warn only → XSS in the era.style origin). Applied
 * server-side in `shop-provider.ts` (drop the feed row) and in the rank-products
 * product validator (reject the request).
 */
export function isHttpsUrl(value: string): boolean {
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Read the request body, enforcing the byte cap on BOTH the declared
 * content-length and the actual text, and parse it as a JSON object. Returns the
 * parsed record, or null on any failure (too large, non-JSON, non-object) — the
 * caller maps null to a 400. An empty body parses to `{}` (all filters absent).
 */
export async function readShopBody(request: Request): Promise<Record<string, unknown> | null> {
  const declaredLength = Number(request.headers.get('content-length'));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_SHOP_BODY_BYTES) {
    return null;
  }
  const rawBody = await request.text().catch(() => '');
  if (rawBody.length > MAX_SHOP_BODY_BYTES) {
    return null;
  }
  let body: unknown;
  try {
    body = rawBody.length > 0 ? JSON.parse(rawBody) : {};
  } catch {
    return null;
  }
  if (typeof body !== 'object' || body === null) {
    return null;
  }
  return body as Record<string, unknown>;
}

/** A bounded, non-empty trimmed string within `max`, or a validation failure. */
function optionalStr(value: unknown, max: number): { ok: true; value?: string } | { ok: false } {
  if (value === undefined) {
    return { ok: true };
  }
  if (typeof value !== 'string' || value.length > max) {
    return { ok: false };
  }
  const trimmed = value.trim();
  return { ok: true, value: trimmed.length > 0 ? trimmed : undefined };
}

/** A finite price in [0, MAX_PRICE], or a validation failure. Absent → ok/undefined. */
function optionalPrice(value: unknown): { ok: true; value?: number } | { ok: false } {
  if (value === undefined) {
    return { ok: true };
  }
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > MAX_PRICE) {
    return { ok: false };
  }
  return { ok: true, value };
}

/**
 * Validate a request body into a `ShopSearchQuery`, or null when malformed.
 * Every field is optional; an absent field is simply not filtered on. An
 * out-of-enum category/tier, a non-numeric or out-of-range price, or an inverted
 * price band (min > max) is a hard failure rather than a silently-empty result.
 */
export function parseShopQuery(root: Record<string, unknown>): ShopSearchQuery | null {
  const q = optionalStr(root.q, MAX_Q_CHARS);
  const size = optionalStr(root.size, MAX_SIZE_CHARS);
  if (!q.ok || !size.ok) {
    return null;
  }

  let category: ItemCategory | undefined;
  if (root.category !== undefined) {
    if (!ITEM_CATEGORIES.includes(root.category as ItemCategory)) {
      return null;
    }
    category = root.category as ItemCategory;
  }

  let brandTier: BrandTier | undefined;
  if (root.brandTier !== undefined) {
    if (!BRAND_TIERS.includes(root.brandTier as BrandTier)) {
      return null;
    }
    brandTier = root.brandTier as BrandTier;
  }

  const minPrice = optionalPrice(root.minPrice);
  const maxPrice = optionalPrice(root.maxPrice);
  if (!minPrice.ok || !maxPrice.ok) {
    return null;
  }
  if (minPrice.value !== undefined && maxPrice.value !== undefined && minPrice.value > maxPrice.value) {
    return null;
  }

  let page: number | undefined;
  if (root.page !== undefined) {
    if (typeof root.page !== 'number' || !Number.isFinite(root.page) || root.page < 1) {
      return null;
    }
    page = Math.floor(root.page);
  }

  return {
    q: q.value,
    category,
    brandTier,
    minPrice: minPrice.value,
    maxPrice: maxPrice.value,
    size: size.value,
    page,
  };
}
