/**
 * Browser-side Shop transport. Thin, typed wrappers over Forge's three
 * same-origin routes so the Shop components never hand-roll a fetch. Every call
 * is credentialed same-origin (the routes read the signed-in user's closet for
 * ranking and log events against their session); nothing here holds a secret.
 *
 * The read path is search → rank (two hops, on purpose): `shop-search` returns a
 * raw page of products, `rank-products` scores that page against the closet. The
 * write path (`rec-event`) is fire-and-forget — a click-out must never wait on a
 * log, so {@link logRecEvent} swallows every error and rides `keepalive` so the
 * beacon survives the tab navigating away.
 */

import type {
  ItemCategory,
  ProductWhy,
  RankedProduct,
  ShopProduct,
  ShopSearchQuery,
  ShopSearchResult,
} from '@era/core/shop';

/**
 * A wishlisted pick as returned by `GET /api/shop/saved`. Shape-compatible with
 * {@link ShopProduct} on every field the Saved grid renders (a saved card is the
 * same {@link ShopCard} with a filled heart), but a saved pick carries no ranking
 * — no `score`, `why`, or `whyDetail` — so it is deliberately narrower than
 * {@link RankedProduct}. Any {@link ShopProduct}/{@link RankedProduct} is
 * assignable to it, which is what lets an optimistic save reuse the card's own
 * product object without a round-trip.
 */
export interface SavedShopProduct {
  readonly id: string;
  readonly title: string;
  readonly brand: string;
  readonly category: ItemCategory;
  readonly price: number;
  readonly currency: string;
  readonly imageUrl: string;
  readonly retailer: string;
  readonly productUrl: string;
  readonly affiliateUrl: string;
}

/** POST a search query → one page of raw (un-ranked) products. */
export async function searchProducts(query: ShopSearchQuery): Promise<ShopSearchResult> {
  const res = await fetch('/api/shop-search', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify(query),
  });
  if (!res.ok) {
    throw new Error(`shop-search failed: ${res.status}`);
  }
  return (await res.json()) as ShopSearchResult;
}

/**
 * POST a page of products → the same products ranked against the user's closet.
 * The route never hard-fails (it degrades to the deterministic ranker), so a
 * 200 is the norm; a non-200 still throws so the caller can show the error state.
 */
export async function rankProducts(products: readonly ShopProduct[]): Promise<RankedProduct[]> {
  const res = await fetch('/api/rank-products', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify({ products }),
  });
  if (!res.ok) {
    throw new Error(`rank-products failed: ${res.status}`);
  }
  const body = (await res.json()) as { products: RankedProduct[] };
  return body.products;
}

/**
 * The body Shop sends when a pick is clicked out to a retailer or dismissed.
 * `why` is the reason's KIND (the string enum the route validates —
 * `'completes_outfits' | 'fills_gap' | 'similar_owned'`), NOT the full
 * ProductWhy object; it is omitted when the pick carried no surfaced reason.
 */
export interface RecEventBody {
  readonly kind: 'rec_click' | 'rec_dismiss';
  readonly productId: string;
  readonly retailer?: string;
  readonly why?: ProductWhy['kind'];
}

/**
 * Fire-and-forget log to `rec-event`. Never awaited, never throws to the caller:
 * a click-out or a dismiss must land instantly regardless of whether the log
 * succeeds. `keepalive` lets the request outlive the tab that opened the link.
 */
export function logRecEvent(body: RecEventBody): void {
  try {
    void fetch('/api/shop/rec-event', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      credentials: 'same-origin',
      keepalive: true,
      body: JSON.stringify(body),
    }).catch(() => {
      /* swallow — the log must never block or surface to the user */
    });
  } catch {
    /* swallow — same reason */
  }
}

/**
 * Wishlist a pick: `POST /api/shop/save`. Unlike {@link logRecEvent}, this is an
 * awaited state change the UI reflects — the caller toggles the heart optimistically
 * and reverts on a throw, so a non-200 must surface as an error, not be swallowed.
 */
export async function saveProduct(product: ShopProduct): Promise<void> {
  const res = await fetch('/api/shop/save', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify({ product }),
  });
  if (!res.ok) {
    throw new Error(`shop-save failed: ${res.status}`);
  }
}

/** Remove a wishlisted pick by id: `DELETE /api/shop/save`. Throws on non-200. */
export async function unsaveProduct(productId: string): Promise<void> {
  const res = await fetch('/api/shop/save', {
    method: 'DELETE',
    headers: { 'content-type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify({ productId }),
  });
  if (!res.ok) {
    throw new Error(`shop-unsave failed: ${res.status}`);
  }
}

/** Hydrate the wishlist: `GET /api/shop/saved` → the user's saved picks. Throws on non-200. */
export async function listSaved(): Promise<SavedShopProduct[]> {
  const res = await fetch('/api/shop/saved', {
    method: 'GET',
    credentials: 'same-origin',
  });
  if (!res.ok) {
    throw new Error(`shop-saved failed: ${res.status}`);
  }
  const body = (await res.json()) as { products: SavedShopProduct[] };
  return body.products;
}
