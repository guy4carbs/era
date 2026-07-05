/**
 * Shop API — the mobile calls into the Shop endpoints.
 *
 *   POST   /api/shop-search    body ShopSearchQuery      -> { products, page, hasMore }
 *   POST   /api/rank-products   body { products }          -> { products: RankedProduct[] }
 *   POST   /api/shop/rec-event  body { kind, productId, retailer?, why? } -> ok
 *   POST   /api/shop/save       body { product }           -> { saved: true }
 *   DELETE /api/shop/save       body { productId }          -> { saved: false }
 *   GET    /api/shop/saved                                  -> { products: SavedShopProduct[] }
 *
 * Every endpoint is owner-scoped, so each request carries the signed-in session.
 * Better Auth's Expo plugin patches the client's own fetch (`authClient.$fetch`)
 * to inject the persisted session cookie and baseURL — calling through `$fetch`
 * is what attaches credentials. This mirrors `components/ovi/api.ts`.
 *
 * Three Shop-specific contracts shape this module:
 *   - `rankProducts` NEVER hard-fails. Ranking is a nicety over an already-usable
 *     browse; if the route errors, callers still get every product back, unranked
 *     (`score: 0`, `why: null`), so the grid renders. Honesty over a blank screen.
 *   - `logRecEvent` is fire-and-forget. A click-out or dismiss must open the link
 *     / remove the card whether or not the log lands, so it swallows every error.
 *   - `listSaved` degrades to `[]` on any error (like `rankProducts`) so the Saved
 *     view opens empty instead of erroring; `saveProduct`/`unsaveProduct` THROW so
 *     the screen can revert its optimistic heart on a failed write.
 */
import type {
  ItemCategory,
  ProductWhy,
  RankedProduct,
  ShopProduct,
  ShopSearchQuery,
  ShopSearchResult,
} from '@era/core/shop';

import { authClient } from '@/lib/auth-client';
import { limitFromFetchError, limitFromResponse } from '@/lib/rate-limit';

/** The structural slice of the auth client we call, named to stay strict. */
interface AuthFetchClient {
  readonly $fetch?: <T>(
    path: string,
    options: { method: string; body?: unknown },
  ) => Promise<{ data: T | null; error: { message?: string } | null }>;
  readonly getCookie?: () => string;
}

const baseURL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000';

/**
 * Authenticated JSON call into an Era API route. Prefers the auth client's
 * `$fetch` (which attaches the session), falling back to a bare fetch with the
 * plugin-stored cookie. Throws on any non-success so callers surface a retry.
 */
async function apiFetch<T>(
  path: string,
  options: { method: string; body?: unknown },
): Promise<T> {
  const client = authClient as unknown as AuthFetchClient;

  if (typeof client.$fetch === 'function') {
    const { data, error } = await client.$fetch<T>(path, options);
    if (error) {
      const limit = limitFromFetchError(error);
      if (limit) throw limit;
      throw new Error(error.message ?? `${path} failed`);
    }
    if (data === null) {
      throw new Error(`${path} failed`);
    }
    return data;
  }

  const cookie = client.getCookie?.() ?? '';
  const headers: Record<string, string> = { cookie };
  if (options.body !== undefined) {
    headers['content-type'] = 'application/json';
  }
  const response = await fetch(`${baseURL}${path}`, {
    method: options.method,
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });
  if (!response.ok) {
    if (response.status === 429) {
      throw await limitFromResponse(response);
    }
    throw new Error(`${path} failed: ${response.status}`);
  }
  return (await response.json()) as T;
}

/** One page of shoppable products for the given filters. Throws so browse can retry. */
export async function searchProducts(query: ShopSearchQuery): Promise<ShopSearchResult> {
  return apiFetch<ShopSearchResult>('/api/shop-search', { method: 'POST', body: query });
}

/**
 * Rank a batch of products against the caller's closet. NEVER hard-fails: on any
 * error (network, dormant LLM, 5xx) it degrades to the input products unranked so
 * the grid still renders — ranking is a bonus, not a gate.
 */
export async function rankProducts(
  products: readonly ShopProduct[],
): Promise<readonly RankedProduct[]> {
  if (products.length === 0) return [];
  try {
    const { products: ranked } = await apiFetch<{ products: readonly RankedProduct[] }>(
      '/api/rank-products',
      { method: 'POST', body: { products } },
    );
    return ranked;
  } catch {
    return products.map((product) => ({ ...product, score: 0, why: null, whyDetail: null }));
  }
}

/** The two recommendation signals the rec-event route records. */
export type RecEventKind = 'rec_click' | 'rec_dismiss';

/** A single recommendation interaction — a click-out or a dismiss. */
export interface RecEvent {
  readonly kind: RecEventKind;
  readonly productId: string;
  readonly retailer?: string;
  readonly why?: ProductWhy | null;
}

/**
 * Log a rec interaction — fire-and-forget. The UI has already acted (opened the
 * retailer, removed the card) by the time this runs, so a logging miss must never
 * surface: every error is swallowed. Never awaited by callers.
 *
 * The route validates `why` as the string enum (`why.kind`), NOT the full
 * ProductWhy object — so a `why`-bearing pick sends its kind as a plain string
 * (`event.why.kind`), omitted when there is no why. Sending the object would 400
 * (swallowed), and only why-less picks would ever record.
 */
export function logRecEvent(event: RecEvent): void {
  const body: Record<string, unknown> = { kind: event.kind, productId: event.productId };
  if (event.retailer) body.retailer = event.retailer;
  if (event.why) body.why = event.why.kind;
  void apiFetch('/api/shop/rec-event', { method: 'POST', body }).catch(() => {
    // A missed rec log is invisible to the user and never blocks the interaction.
  });
}

/**
 * A saved (wishlisted) pick as the Saved view renders it. A ShopProduct-shaped
 * slice: enough to render a card and click out to the retailer, minus the ranking
 * scaffolding (`brandTier`, `sizes`, `colors`, `why`, `whyDetail`) the Saved list
 * doesn't need. Kept local to mobile — the save endpoints are the only producers.
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

/**
 * Save a pick to the wishlist. THROWS on failure so the caller can revert its
 * optimistic heart — a save that silently no-ops would leave a filled heart with
 * nothing behind it. The body carries the full product so the server can persist a
 * card it can render later without a second lookup.
 */
export async function saveProduct(product: ShopProduct): Promise<void> {
  await apiFetch('/api/shop/save', { method: 'POST', body: { product } });
}

/** Remove a pick from the wishlist by id. THROWS on failure (see `saveProduct`). */
export async function unsaveProduct(productId: string): Promise<void> {
  await apiFetch('/api/shop/save', { method: 'DELETE', body: { productId } });
}

/**
 * The current wishlist. NEVER hard-fails: on any error it degrades to `[]` so the
 * Saved view opens to its empty state rather than an error screen — a missing
 * wishlist is a "nothing saved yet", not a fault the user must retry.
 */
export async function listSaved(): Promise<readonly SavedShopProduct[]> {
  try {
    const { products } = await apiFetch<{ products: readonly SavedShopProduct[] }>(
      '/api/shop/saved',
      { method: 'GET' },
    );
    return products;
  } catch {
    return [];
  }
}
