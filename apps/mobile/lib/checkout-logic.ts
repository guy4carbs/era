/**
 * Pure, device-free logic for the in-flow checkout surface — the bits worth
 * testing in plain Node (`node --experimental-strip-types --test`), kept out of
 * the React components so they can be exercised without a renderer. Three concerns
 * live here: the cart-count fold that drives the Shop-tab badge, the saved-size
 * prefill selection that seeds a cart item's size chip, and the batch-poll timing
 * predicates the checkout API's poll loop runs on.
 *
 * All functions are total and never throw — a garbage quantity folds to 0, an
 * unknown category prefills nothing, a NaN timestamp reads as "keep polling until a
 * real clock says stop". Grounded in `@era/core`'s {@link sizeKindForCategory} so
 * the size dimension a category maps to is decided in exactly one place.
 */
import { sizeKindForCategory } from '@era/core/checkout';
import type { SizeKind } from '@era/core/checkout';
import type { ItemCategory } from '@era/core/shop';

/**
 * The three saved body sizes, as `GET /api/settings/sizes` returns them — each
 * nullable (the user may have set none, some, or all). Validated server-side
 * against `SIZE_OPTIONS`; the client treats them as opaque display strings.
 */
export interface UserSizes {
  readonly apparelSize: string | null;
  readonly denimSize: string | null;
  readonly shoeSize: string | null;
}

/** A cart line as the badge fold needs it — only the quantity is read. */
export interface CartCountable {
  readonly quantity: number;
}

/**
 * Fold cart lines to the count shown on the Shop-tab badge — the SUM of item
 * quantities, not the number of lines, so two of one piece reads as "2". A
 * non-finite or sub-1 quantity contributes 0 (a defensive guard; a real row is
 * ≥1), and quantities floor to whole units. Empty cart → 0. Pure; never throws.
 */
export function cartCountFromItems(items: readonly CartCountable[]): number {
  return items.reduce((sum, item) => {
    const qty = Number.isFinite(item.quantity) && item.quantity >= 1 ? Math.floor(item.quantity) : 0;
    return sum + qty;
  }, 0);
}

/**
 * The saved size to prefill for a cart item of `category`, or `null` when we hold
 * none to offer (an unset dimension, or a `one_size` category that has no body
 * size). Routes the category to its size dimension via {@link sizeKindForCategory}
 * — apparel/denim/shoe read their matching saved size; `one_size` never prefills.
 * A prefill is only ever a suggestion the user can change inline; we never invent a
 * measurement we don't store. Pure; never throws.
 */
export function prefillSizeForCategory(
  category: ItemCategory,
  sizes: UserSizes,
): string | null {
  switch (sizeKindForCategory(category)) {
    case 'apparel':
      return sizes.apparelSize;
    case 'denim':
      return sizes.denimSize;
    case 'shoe':
      return sizes.shoeSize;
    case 'one_size':
      return null;
  }
}

/**
 * The selectable size options per body-size dimension, mirroring `@era/core`'s
 * `SIZE_OPTIONS` partition (which exports only the combined list). The size-chip
 * editor renders the set for a given kind. Kept in lockstep with core by the
 * `size options are a subset of core SIZE_OPTIONS` test — a candidate to promote to
 * a `sizeOptionsForKind` export in core when the shop contract reopens.
 */
export const SIZE_OPTIONS_BY_KIND: Record<Exclude<SizeKind, 'one_size'>, readonly string[]> = {
  apparel: ['XS', 'S', 'M', 'L', 'XL'],
  denim: ['24', '26', '28', '30', '32'],
  shoe: ['37', '38', '39', '40', '41', '42'],
};

/**
 * The selectable sizes for a category's dimension — the chips shown when editing an
 * item's size. `one_size` has none (nothing to pick). Pure; never throws.
 */
export function sizeOptionsForKind(kind: SizeKind): readonly string[] {
  return kind === 'one_size' ? [] : SIZE_OPTIONS_BY_KIND[kind];
}

/** Batch-poll cadence: refetch the batch every 2s while an order is being worked. */
export const CHECKOUT_POLL_INTERVAL_MS = 2_000;

/**
 * Batch-poll wall clock: give up after 120s and surface the calm retry line rather
 * than poll forever. Rye offer resolution can take minutes, but the sheet caps a
 * single poll session here and lets the user re-open to resume — an intent stays
 * live server-side (Rye intents expire at 45min), so a re-open picks it back up.
 */
export const CHECKOUT_POLL_CAP_MS = 120_000;

/**
 * Whether the batch poll has run past its {@link CHECKOUT_POLL_CAP_MS} wall clock
 * and should stop. `startedAtMs` is when this poll session began; `nowMs` is the
 * current clock. A non-finite `startedAtMs` reads as "not yet started" (never
 * expired) so a bad clock can't abort a poll prematurely. Pure; never throws.
 */
export function checkoutPollExpired(startedAtMs: number, nowMs: number): boolean {
  if (!Number.isFinite(startedAtMs) || !Number.isFinite(nowMs)) return false;
  return nowMs - startedAtMs >= CHECKOUT_POLL_CAP_MS;
}

/**
 * Order statuses that mean an offer is still being resolved (the pre-offer beats).
 * While ANY order sits here the checkout poll keeps going before showing the
 * review. `retrieving_offer` is Rye's; `creating` is the server's pre-Rye insert.
 */
const PRE_OFFER_STATES: ReadonlySet<string> = new Set(['creating', 'retrieving_offer']);

/**
 * Terminal order statuses — an order in one of these is done being worked. Drives
 * the confirm-phase poll: once every order is terminal, the outcomes are final.
 */
const TERMINAL_STATES: ReadonlySet<string> = new Set(['completed', 'failed', 'expired']);

/** Just the status field the phase predicates read off a batch order. */
export interface OrderStatusLike {
  readonly status: string;
}

/**
 * Whether the offer-resolution phase has settled: every order has LEFT the
 * pre-offer beats (so each is awaiting confirmation, needs action, or already
 * failed/expired). The review screen — the combined price shown before the buyer
 * confirms — opens only once this holds. An empty batch is never "settled" (there
 * is nothing to review). Pure; never throws.
 */
export function offerPhaseSettled(orders: readonly OrderStatusLike[]): boolean {
  return orders.length > 0 && orders.every((order) => !PRE_OFFER_STATES.has(order.status));
}

/**
 * Whether the confirmation phase has settled: every order has reached a terminal
 * status (completed, failed, or expired), so the per-store outcomes are final and
 * polling can stop. An empty batch is never "settled". Pure; never throws.
 */
export function confirmPhaseSettled(orders: readonly OrderStatusLike[]): boolean {
  return orders.length > 0 && orders.every((order) => TERMINAL_STATES.has(order.status));
}
