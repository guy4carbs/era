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
  ProductWhy,
  RankedProduct,
  ShopProduct,
  ShopSearchQuery,
  ShopSearchResult,
} from '@era/core/shop';

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
