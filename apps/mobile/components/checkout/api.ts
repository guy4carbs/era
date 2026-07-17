/**
 * Checkout API — the mobile calls into the in-flow cart + single-checkout routes,
 * plus the two settings routes (saved sizes, one shipping address) the checkout UI
 * reads and writes.
 *
 *   GET    /api/settings/sizes                        -> UserSizes
 *   PUT    /api/settings/sizes            body UserSizes           -> UserSizes
 *   GET    /api/settings/shipping-address             -> ShippingAddress | { address: null }
 *   PUT    /api/settings/shipping-address body ShippingAddress     -> ShippingAddress
 *   DELETE /api/settings/shipping-address             -> { deleted: true }
 *   GET    /api/cart                                  -> { items: CartItem[] }
 *   POST   /api/cart    body { product, size?, quantity? }         -> { item: CartItem }
 *   DELETE /api/cart    body { cartItemId }                        -> { removed: true }
 *   POST   /api/checkout                              -> 201 CheckoutStart
 *   GET    /api/checkout/batches/{id}                 -> CheckoutBatch
 *   POST   /api/checkout/batches/{id}/confirm         -> CheckoutBatch
 *   GET    /api/checkout/orders                       -> { orders: OrderRecord[] }
 *
 * Owner-scoped, so each request carries the signed-in session via Better Auth's
 * `$fetch` (which injects the persisted cookie + baseURL), falling back to a bare
 * fetch with the plugin cookie — the same idiom as `components/shop/api.ts` and
 * `components/avatar/api.ts`. Uses ABSOLUTE URLs (`${baseURL}${path}`): `$fetch`
 * resolves relative paths against `/api/auth` under Metro and would 404.
 *
 * The whole surface is server-gated: with `ERA_CHECKOUT_ENABLED` off EVERY route
 * here 404s and no order is ever created — the client's cosmetic flag only decides
 * whether we render the UI that calls these. Non-2xx statuses on the checkout
 * action map to typed, catchable errors so the sheet can branch honestly (no
 * address, empty cart, daily cap, an invalid confirm state, an unconfigured
 * payment seam) rather than surface a cold crash. A failed checkout NEVER empties
 * the cart — the pieces stay put so the user can retry or tap out.
 */
import type { CheckoutOffer, CheckoutSupport, CombinedOffer } from '@era/core/checkout';
import type { ItemCategory } from '@era/core/shop';

import { authClient } from '@/lib/auth-client';
import {
  CHECKOUT_POLL_INTERVAL_MS,
  checkoutPollExpired,
  confirmPhaseSettled,
  offerPhaseSettled,
  type UserSizes,
} from '@/lib/checkout-logic';

export type { UserSizes };

// --- typed error classes ----------------------------------------------------

/** The checkout surface is off server-side (HTTP 404) — a dormant beat, not a fault. */
export class CheckoutUnavailableError extends Error {
  readonly status = 404;

  constructor() {
    super('checkout unavailable');
    this.name = 'CheckoutUnavailableError';
  }
}

/** Checkout was started with no saved shipping address (HTTP 409 `no_address`). */
export class NoAddressError extends Error {
  readonly status = 409;

  constructor() {
    super('no shipping address');
    this.name = 'NoAddressError';
  }
}

/** Checkout was started with nothing in-flow-buyable in the cart (HTTP 400 `empty_cart`). */
export class EmptyCartError extends Error {
  readonly status = 400;

  constructor() {
    super('empty cart');
    this.name = 'EmptyCartError';
  }
}

/** The per-user daily order cap is reached (HTTP 429) — a calm pause, retry tomorrow. */
export class DailyLimitError extends Error {
  readonly status = 429;

  constructor() {
    super('daily limit reached');
    this.name = 'DailyLimitError';
  }
}

/** Confirm was called when the batch's orders weren't all awaiting confirmation (HTTP 409). */
export class InvalidStateError extends Error {
  readonly status = 409;

  constructor() {
    super('invalid checkout state');
    this.name = 'InvalidStateError';
  }
}

/** Confirm hit the live-payment seam with sandbox off (HTTP 503 `not_configured`). */
export class NotConfiguredError extends Error {
  readonly status = 503;

  constructor() {
    super('checkout payment not configured');
    this.name = 'NotConfiguredError';
  }
}

/** A generic, retryable checkout failure — any other non-success. The UI offers another go. */
export class CheckoutFailedError extends Error {
  constructor() {
    super('checkout failed');
    this.name = 'CheckoutFailedError';
  }
}

// --- contract types (the frozen mobile surface) ------------------------------

/**
 * A saved shipping address — the {@link CheckoutBuyer} fields MINUS email (email
 * comes from the session at checkout time). `country` is ISO-2. This is PII: the
 * server is the only place it is marshalled to Rye, it is never logged, and the
 * DELETE route wipes it.
 */
export interface ShippingAddress {
  readonly firstName: string;
  readonly lastName: string;
  readonly phone?: string;
  readonly address1: string;
  readonly address2?: string;
  readonly city: string;
  readonly province: string;
  readonly postalCode: string;
  /** ISO-2 country code (e.g. 'US'). */
  readonly country: string;
}

/** The GET shipping-address reply — the saved address, or `{ address: null }` when none is set. */
export type ShippingAddressState = ShippingAddress | { readonly address: null };

/** True when the shipping-address read returned a saved address (vs the empty `{ address: null }`). */
export function hasShippingAddress(state: ShippingAddressState): state is ShippingAddress {
  return !('address' in state) || state.address !== null;
}

/**
 * One line in the cart — a denormalized product snapshot (integer-cents price) plus
 * the chosen size, quantity, and whether it can be bought in-flow or must hand off
 * to the retailer's affiliate link. `cartItemId` is the row handle DELETE takes.
 */
export interface CartItem {
  readonly cartItemId: string;
  readonly productId: string;
  readonly retailer: string;
  readonly title: string;
  readonly brand?: string;
  readonly imageUrl?: string;
  readonly productUrl: string;
  readonly affiliateUrl: string;
  readonly priceSnapshotCents: number;
  readonly currency: string;
  readonly category?: ItemCategory;
  readonly size: string | null;
  readonly quantity: number;
  readonly support: CheckoutSupport;
}

/**
 * The product fields the cart persists in its denormalized snapshot — the subset
 * both the ranked feed's `RankedProduct` (a full `ShopProduct`) and the leaner
 * `SavedShopProduct` satisfy, so a piece can be added to the cart from either the
 * "For you" feed or the Saved wishlist. `brandTier`/`sizes`/`colors` aren't part of
 * the cart snapshot, so they're intentionally absent here.
 */
export interface CartAddProduct {
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

/** The lean POST /api/checkout reply — the minted batch id and each order's opening status. */
export interface CheckoutStart {
  readonly batchId: string;
  readonly orders: readonly { readonly orderId: string; readonly status: string }[];
}

/**
 * One order inside a checkout batch, as the batch poll + confirm return it.
 * `status` is the DB status enum (Rye's states plus the server's `creating` and
 * terminal `expired`). `offer` is present once resolved; `vendorOrderId` once
 * `completed`; `failureReason` a short code only when `failed`.
 */
export interface BatchOrder {
  readonly orderId: string;
  readonly retailer: string;
  readonly status: string;
  readonly offer?: CheckoutOffer;
  readonly vendorOrderId?: string;
  readonly failureReason?: string;
}

/** A checkout batch — its member orders plus the combined per-store + grand total view. */
export interface CheckoutBatch {
  readonly orders: readonly BatchOrder[];
  readonly combined: CombinedOffer;
}

/** One row in the orders history list (newest first), the Settings surface renders. */
export interface OrderRecord {
  readonly orderId: string;
  readonly retailer: string;
  readonly title: string;
  readonly status: string;
  readonly totalCents: number | null;
  readonly currency: string;
  readonly affiliateUrl: string;
  readonly createdAt: string;
}

// --- shared fetch plumbing ---------------------------------------------------

/** The structural slice of the auth client we call, named to stay strict. */
interface AuthFetchClient {
  readonly $fetch?: <T>(
    path: string,
    options: { method: string; body?: unknown },
  ) => Promise<{ data: T | null; error: (Record<string, unknown> & { message?: string }) | null }>;
  readonly getCookie?: () => string;
}

const baseURL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000';

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** The classified outcome of {@link request}: the parsed body, or a status + raw body. */
type RequestResult<T> = { ok: true; data: T } | { ok: false; status: number; body: unknown };

/**
 * A minimal authed request returning either the parsed body or the raw status for
 * the caller to classify. Prefers `$fetch` (attaches the session); falls back to a
 * bare fetch with the plugin cookie. A transport failure with no status surfaces as
 * `status: 0` so a caller can treat it as retryable, never a crash.
 */
async function request<T>(
  path: string,
  options: { method: string; body?: unknown },
): Promise<RequestResult<T>> {
  const client = authClient as unknown as AuthFetchClient;

  if (typeof client.$fetch === 'function') {
    try {
      const { data, error } = await client.$fetch<T>(`${baseURL}${path}`, options);
      if (error) {
        const status = typeof error.status === 'number' ? error.status : 0;
        return { ok: false, status, body: error };
      }
      if (data === null) return { ok: false, status: 0, body: null };
      return { ok: true, data };
    } catch {
      return { ok: false, status: 0, body: null };
    }
  }

  const cookie = client.getCookie?.() ?? '';
  const headers: Record<string, string> = { cookie };
  if (options.body !== undefined) headers['content-type'] = 'application/json';
  try {
    const response = await fetch(`${baseURL}${path}`, {
      method: options.method,
      headers,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    });
    if (!response.ok) {
      const body = await response.json().catch(() => null);
      return { ok: false, status: response.status, body };
    }
    return { ok: true, data: (await response.json()) as T };
  } catch {
    return { ok: false, status: 0, body: null };
  }
}

// --- settings: saved sizes ---------------------------------------------------

/**
 * Read the caller's saved body sizes (each nullable). NEVER hard-fails — on any
 * error it degrades to all-null so a size miss just means "no prefill", never a
 * broken cart or settings section.
 */
export async function getSizes(): Promise<UserSizes> {
  const result = await request<UserSizes>('/api/settings/sizes', { method: 'GET' });
  if (result.ok) return result.data;
  return { apparelSize: null, denimSize: null, shoeSize: null };
}

/**
 * Upsert the caller's saved body sizes. Sends the full triple (server validates
 * each against `SIZE_OPTIONS`). THROWS {@link CheckoutFailedError} on failure so a
 * settings editor can surface an honest retry rather than pretend a size stuck.
 */
export async function putSizes(sizes: UserSizes): Promise<UserSizes> {
  const result = await request<UserSizes>('/api/settings/sizes', { method: 'PUT', body: sizes });
  if (result.ok) return result.data;
  throw new CheckoutFailedError();
}

// --- settings: shipping address ---------------------------------------------

/**
 * Read the caller's saved shipping address, or `{ address: null }` when none is
 * set. THROWS {@link CheckoutFailedError} on any transport/5xx error so a caller
 * can offer a retry rather than render a falsely-empty address; a 200 with
 * `{ address: null }` is a normal "none yet" answer, not an error.
 */
export async function getShippingAddress(): Promise<ShippingAddressState> {
  const result = await request<ShippingAddressState>('/api/settings/shipping-address', {
    method: 'GET',
  });
  if (result.ok) return result.data;
  throw new CheckoutFailedError();
}

/**
 * Upsert the caller's shipping address (`country` ISO-2). THROWS
 * {@link CheckoutFailedError} on failure so the capture form can surface an honest
 * retry instead of advancing checkout on an address that didn't save.
 */
export async function putShippingAddress(address: ShippingAddress): Promise<ShippingAddress> {
  const result = await request<ShippingAddress>('/api/settings/shipping-address', {
    method: 'PUT',
    body: address,
  });
  if (result.ok) return result.data;
  throw new CheckoutFailedError();
}

/**
 * Delete the caller's saved shipping address (PII wipe). THROWS
 * {@link CheckoutFailedError} on failure so the settings row can surface a retry.
 */
export async function deleteShippingAddress(): Promise<void> {
  const result = await request<{ deleted: boolean }>('/api/settings/shipping-address', {
    method: 'DELETE',
  });
  if (!result.ok) throw new CheckoutFailedError();
}

// --- cart --------------------------------------------------------------------

/**
 * The current cart's lines. NEVER hard-fails — on any error it degrades to `[]` so
 * the cart sheet opens to its empty state rather than an error screen. A missing
 * cart is "nothing added yet", not a fault to retry.
 */
export async function getCart(): Promise<readonly CartItem[]> {
  const result = await request<{ items: readonly CartItem[] }>('/api/cart', { method: 'GET' });
  if (result.ok) return result.data.items;
  return [];
}

/**
 * Add a piece to the cross-store cart — idempotent server-side (re-adding the same
 * product is a no-op via `onConflictDoNothing`). Resolves `true` when a new row was
 * created, `false` when the product was already in the cart. THROWS
 * {@link CheckoutFailedError} on failure so the card can revert its optimistic
 * "Added" feedback and badge bump. The body carries the full product so the server
 * persists a renderable snapshot. Callers reconcile the badge from {@link getCart}
 * rather than the return, since the idempotent no-op path returns no row to echo.
 */
export async function addToCart(
  product: CartAddProduct,
  options: { size?: string; quantity?: number } = {},
): Promise<boolean> {
  const body: Record<string, unknown> = { product };
  if (options.size !== undefined) body.size = options.size;
  if (options.quantity !== undefined) body.quantity = options.quantity;
  const result = await request<{ added: boolean }>('/api/cart', { method: 'POST', body });
  if (result.ok) return result.data.added;
  throw new CheckoutFailedError();
}

/**
 * Remove a piece from the cart by its `cartItemId`. THROWS
 * {@link CheckoutFailedError} on failure so the sheet can revert its optimistic
 * removal (put the line back) rather than lose a piece the server still holds.
 */
export async function removeFromCart(cartItemId: string): Promise<void> {
  const result = await request<{ deleted: boolean }>('/api/cart', {
    method: 'DELETE',
    body: { cartItemId },
  });
  if (!result.ok) throw new CheckoutFailedError();
}

// --- checkout ----------------------------------------------------------------

/**
 * Map a checkout/confirm non-success status to its typed error. `no_address` and
 * `invalid_state` both surface as 409, disambiguated on the body's `error` code so
 * the sheet routes to "add an address" vs "the order state moved on".
 */
function checkoutError(status: number, body: unknown): Error {
  const code = errorCode(body);
  switch (status) {
    case 404:
      return new CheckoutUnavailableError();
    case 400:
      return new EmptyCartError();
    case 409:
      return code === 'invalid_state' ? new InvalidStateError() : new NoAddressError();
    case 429:
      return new DailyLimitError();
    case 503:
      return new NotConfiguredError();
    default:
      return new CheckoutFailedError();
  }
}

/** Pull a short `error` code string off a parsed error body, when present. */
function errorCode(body: unknown): string | null {
  if (typeof body !== 'object' || body === null) return null;
  const value = (body as Record<string, unknown>).error;
  return typeof value === 'string' ? value : null;
}

/**
 * Start the ONE checkout action across every in-flow-buyable piece in the cart.
 * Resolves to the minted batch id + each order's opening status; the caller then
 * polls {@link pollBatch} to the review screen. Errors branch by typed class:
 * {@link NoAddressError} (409), {@link EmptyCartError} (400), {@link DailyLimitError}
 * (429), {@link CheckoutUnavailableError} (404), else {@link CheckoutFailedError}.
 * A failure leaves the cart untouched (nothing is claimed on the client).
 */
export async function startCheckout(): Promise<CheckoutStart> {
  const result = await request<CheckoutStart>('/api/checkout', { method: 'POST' });
  if (result.ok) return result.data;
  throw checkoutError(result.status, result.body);
}

/** Read one checkout batch (its member orders + combined totals). THROWS on non-success. */
export async function getBatch(batchId: string): Promise<CheckoutBatch> {
  const result = await request<CheckoutBatch>(`/api/checkout/batches/${batchId}`, {
    method: 'GET',
  });
  if (result.ok) return result.data;
  throw checkoutError(result.status, result.body);
}

/**
 * Confirm the batch — places every in-flow order (sandbox: with a test token). All
 * members must be awaiting confirmation or the server 409s
 * ({@link InvalidStateError}); sandbox-off surfaces {@link NotConfiguredError}
 * (503, the live-payment launch seam). Resolves to the post-confirm batch; the
 * caller polls {@link pollBatch} to terminal outcomes.
 */
export async function confirmBatch(batchId: string): Promise<CheckoutBatch> {
  const result = await request<CheckoutBatch>(`/api/checkout/batches/${batchId}/confirm`, {
    method: 'POST',
  });
  if (result.ok) return result.data;
  throw checkoutError(result.status, result.body);
}

/**
 * Newest-first order history (the Settings surface). NEVER hard-fails — degrades to
 * `[]` on any error so the list opens to its empty state rather than erroring.
 */
export async function getOrders(): Promise<readonly OrderRecord[]> {
  const result = await request<{ orders: readonly OrderRecord[] }>('/api/checkout/orders', {
    method: 'GET',
  });
  if (result.ok) return result.data.orders;
  return [];
}

/** Which poll phase a {@link pollBatch} run is settling for. */
export type BatchPhase = 'offer' | 'confirm';

/**
 * Poll a checkout batch every 2s until its orders settle for the given phase (offer
 * resolution, or post-confirm terminal), the 120s wall clock trips, or the caller's
 * `alive()` guard goes false (the sheet closed / the component unmounted — the poll
 * must not touch state after that). Offer resolution can take MINUTES; the cap is a
 * per-session bound, and because Rye intents live server-side (45min TTL) a re-open
 * resumes where this left off. Returns the last batch read at settle/cap; propagates
 * a hard read error (the sheet shows the calm retry line). Never mutates anything.
 */
export async function pollBatch(
  batchId: string,
  phase: BatchPhase,
  alive: () => boolean,
): Promise<CheckoutBatch> {
  const settled = phase === 'offer' ? offerPhaseSettled : confirmPhaseSettled;
  const startedAt = Date.now();
  let latest = await getBatch(batchId);
  while (alive() && !settled(latest.orders) && !checkoutPollExpired(startedAt, Date.now())) {
    await delay(CHECKOUT_POLL_INTERVAL_MS);
    if (!alive()) break;
    latest = await getBatch(batchId);
  }
  return latest;
}
