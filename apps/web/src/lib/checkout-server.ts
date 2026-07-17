/**
 * Server-only orchestration for the cross-store cart's ONE checkout action — the
 * batch that mints, refreshes, and confirms N sibling Rye checkout-intents behind the
 * `@era/core/checkout` `CheckoutProvider` contract. There is NO batch table and NO
 * cross-order atomicity to fake: the neon-http driver has no transactions, so a
 * "batch" is just the set of `orders` rows sharing a `checkoutBatchId`, and its status
 * is DERIVED by folding the members. Every per-store outcome is honest — one store's
 * failure never rolls back or hides another's success.
 *
 * The flow:
 *   - createCheckoutBatch — mint a batchId; per in-flow item: insert a claim row
 *     (the partial-unique active index is the no-transaction double-submit guard — a
 *     conflict means "already running" → skip), then createIntent (referenceId = the
 *     order id, a price ceiling = snapshot × qty × 1.5), then persist intentId + state
 *     + offer. A per-item vendor failure fails THAT row and the batch proceeds.
 *   - refreshBatch — the mobile poll: re-fetch every non-terminal member via getIntent,
 *     persist, and return the members plus their combined per-store + grand total.
 *   - confirmBatch — the explicit purchase: all members must be awaiting_confirmation;
 *     confirm each sequentially with the sandbox test token; a completed member clears
 *     its cart row. Gated to sandbox at the route (the live-payment launch seam).
 *
 * Daily cap: a user may create at most {@link CHECKOUT_DAILY_LIMIT} order rows per UTC
 * day (counted the same way as the AI rate limits, via `utcDayStart`).
 *
 * Never import from a client bundle — it talks to the database and the vendor client.
 */
import { randomUUID } from 'node:crypto';

import { and, count, desc, eq, gte } from 'drizzle-orm';

import {
  type CheckoutBuyer,
  type CheckoutOffer,
  type CheckoutProvider,
  type CombinedOffer,
  type RetailerOffer,
  combineOffers,
} from '@era/core/checkout';
import type { BrandTier, ItemCategory, ShopProduct } from '@era/core/shop';
import { type CartItem, type DbClient, type Order, cartItems, orders } from '@era/db';

import { utcDayStart } from './ai-usage.ts';
import { checkoutEnvironment } from './rye.ts';

/** Max order rows a user may create per UTC day — the abuse ceiling on the checkout action. */
export const CHECKOUT_DAILY_LIMIT = 10;

/** Headroom over the snapshot price for the intent's `maxTotalPrice` ceiling (covers real shipping + tax). */
const PRICE_CEILING_FACTOR = 1.5;

/** The sandbox test payment token — the ONLY token used to confirm (real tokenization is a launch gate). */
const SANDBOX_PAYMENT = { type: 'stripe_token', stripeToken: 'tok_visa' } as const;

/** The five ACTIVE (non-terminal) order states — the ones a poll/confirm still advances. */
const ACTIVE_STATES: ReadonlySet<string> = new Set([
  'creating',
  'retrieving_offer',
  'awaiting_confirmation',
  'requires_action',
  'placing_order',
]);

/**
 * Build a `ShopProduct` from a denormalized cart row, for the provider's `supports()`
 * gate and per-item support flags. `supports()` reads only `retailer` + `productUrl`,
 * so the synthesized `brandTier` (not stored) is inert; the rest is faithful to the row.
 */
export function cartRowToShopProduct(row: CartItem): ShopProduct {
  return {
    id: row.productId,
    title: row.title,
    brand: row.brand ?? '',
    brandTier: 'contemporary' as BrandTier,
    category: (row.category ?? 'accessory') as ItemCategory,
    price: row.priceSnapshotCents / 100,
    currency: row.currency,
    imageUrl: row.imageUrl ?? '',
    retailer: row.retailer,
    productUrl: row.productUrl,
    affiliateUrl: row.affiliateUrl,
  };
}

/** The per-user daily-cap decision, counted over the user's own order rows for the UTC day. */
export interface CheckoutLimitCheck {
  readonly allowed: boolean;
  readonly used: number;
  readonly limit: number;
}

/**
 * Count today's order rows for a user and decide whether another checkout is allowed.
 * Called BEFORE minting the batch — a false `allowed` means the route returns 429.
 * Keyed to the same UTC-day window as the AI rate limits.
 */
export async function checkCheckoutDailyLimit(db: DbClient, userId: string): Promise<CheckoutLimitCheck> {
  const [row] = await db
    .select({ used: count() })
    .from(orders)
    .where(and(eq(orders.userId, userId), gte(orders.createdAt, utcDayStart())));
  const used = Number(row?.used ?? 0);
  return { allowed: used < CHECKOUT_DAILY_LIMIT, used, limit: CHECKOUT_DAILY_LIMIT };
}

/** The status/offer columns to persist when an intent resolves. Currency only when an offer exists (it's notNull). */
function offerColumns(offer: CheckoutOffer | undefined): Record<string, unknown> {
  if (offer === undefined) {
    return { subtotalCents: null, shippingCents: null, taxCents: null, totalCents: null };
  }
  return {
    subtotalCents: offer.subtotalCents,
    shippingCents: offer.shippingCents,
    taxCents: offer.taxCents,
    totalCents: offer.totalCents,
    currency: offer.currency,
  };
}

/** One order's line in the batch-create result — an orderId when a row was minted, else an already_running note. */
export interface BatchOrderResult {
  readonly productId: string;
  readonly orderId?: string;
  readonly status: string;
  readonly note?: string;
}

/** The result of minting a checkout batch — the shared id + one line per attempted item. */
export interface CreateBatchResult {
  readonly batchId: string;
  readonly orders: readonly BatchOrderResult[];
}

/**
 * Mint one checkout batch across the given in-flow cart items. `items` MUST be the
 * subset the provider supports (the route partitions and gates first). For each item:
 * insert a claim row (a conflict on the active double-submit index → skip as
 * already_running), create a Rye intent (referenceId = the order id, a price ceiling
 * of snapshot × qty × 1.5), and persist the returned intentId + state + offer. A
 * vendor failure on one item marks THAT row failed and the batch continues — honest
 * per-store outcomes, no faked atomicity. Unsupported items are never passed here;
 * they stay in the cart as an affiliate handoff.
 */
export async function createCheckoutBatch(
  userId: string,
  items: readonly CartItem[],
  buyer: CheckoutBuyer,
  provider: CheckoutProvider,
  db: DbClient,
): Promise<CreateBatchResult> {
  const batchId = randomUUID();
  const environment = checkoutEnvironment();
  const results: BatchOrderResult[] = [];

  for (const item of items) {
    // 1) CLAIM — insert the order row; a conflict on the partial-unique active index
    //    (userId, productId) means a live order already exists → skip (double-submit guard).
    const [claim] = await db
      .insert(orders)
      .values({
        userId,
        checkoutBatchId: batchId,
        provider: provider.name,
        environment,
        productId: item.productId,
        retailer: item.retailer,
        title: item.title,
        brand: item.brand,
        imageUrl: item.imageUrl,
        productUrl: item.productUrl,
        affiliateUrl: item.affiliateUrl,
        category: item.category,
        priceSnapshotCents: item.priceSnapshotCents,
        size: item.size,
        quantity: item.quantity,
        currency: item.currency,
        status: 'creating',
      })
      .onConflictDoNothing()
      .returning({ id: orders.id });

    if (!claim) {
      results.push({ productId: item.productId, status: 'already_running', note: 'already_running' });
      continue;
    }

    // 2) CREATE the vendor intent. The price ceiling stops a runaway offer auto-confirming.
    const maxTotalCents = Math.ceil(item.priceSnapshotCents * item.quantity * PRICE_CEILING_FACTOR);
    try {
      const intent = await provider.createIntent({
        productUrl: item.productUrl,
        quantity: item.quantity,
        buyer,
        variantSelections: item.size ? { size: item.size } : undefined,
        maxTotalCents,
        referenceId: claim.id,
      });

      // 3) PERSIST the intent id + state + offer onto the claimed row.
      await db
        .update(orders)
        .set({
          intentId: intent.id,
          status: intent.state,
          vendorOrderId: intent.vendorOrderId ?? null,
          failureReason: intent.failureReason ?? null,
          ...offerColumns(intent.offer),
        })
        .where(eq(orders.id, claim.id));
      results.push({ productId: item.productId, orderId: claim.id, status: intent.state });
    } catch (error) {
      // Per-item vendor failure — fail THIS row, keep the batch going. No PII/key logged.
      console.error('[era-checkout] createIntent failed for one order; marking it failed:', error instanceof Error ? error.name : 'unknown');
      await db
        .update(orders)
        .set({ status: 'failed', failureReason: 'create_failed' })
        .where(eq(orders.id, claim.id));
      results.push({ productId: item.productId, orderId: claim.id, status: 'failed' });
    }
  }

  return { batchId, orders: results };
}

/** A member order paired with the batch's combined per-store + grand-total offer view. */
export interface BatchView {
  readonly orders: readonly Order[];
  readonly combined: CombinedOffer;
}

/** Load a batch's member rows, owner-scoped and newest-first-stable by creation. */
async function loadBatchMembers(db: DbClient, userId: string, batchId: string): Promise<Order[]> {
  return db
    .select()
    .from(orders)
    .where(and(eq(orders.userId, userId), eq(orders.checkoutBatchId, batchId)))
    .orderBy(orders.createdAt);
}

/** Fold members with a resolved offer (totalCents set) into per-store `RetailerOffer`s for `combineOffers`. */
function membersToOffers(members: readonly Order[]): RetailerOffer[] {
  const offers: RetailerOffer[] = [];
  for (const m of members) {
    if (m.totalCents !== null && m.subtotalCents !== null && m.shippingCents !== null && m.taxCents !== null) {
      offers.push({
        retailer: m.retailer,
        subtotalCents: m.subtotalCents,
        shippingCents: m.shippingCents,
        taxCents: m.taxCents,
        totalCents: m.totalCents,
        currency: m.currency,
      });
    }
  }
  return offers;
}

/**
 * Refresh a batch: re-fetch every NON-terminal member with an intent id via getIntent,
 * persist the fresh state + offer, and return the members plus their combined totals.
 * Owner-scoped — returns null when the batch has no members for this user (route → 404).
 * A getIntent failure leaves that member unchanged (a transient miss, not a regression).
 */
export async function refreshBatch(
  userId: string,
  batchId: string,
  provider: CheckoutProvider,
  db: DbClient,
): Promise<BatchView | null> {
  const members = await loadBatchMembers(db, userId, batchId);
  if (members.length === 0) {
    return null;
  }

  for (const member of members) {
    if (!ACTIVE_STATES.has(member.status) || member.intentId === null) {
      continue;
    }
    try {
      const intent = await provider.getIntent(member.intentId);
      await db
        .update(orders)
        .set({
          status: intent.state,
          vendorOrderId: intent.vendorOrderId ?? null,
          failureReason: intent.failureReason ?? null,
          ...offerColumns(intent.offer),
        })
        .where(eq(orders.id, member.id));
    } catch (error) {
      // Leave the member as-is — a transient poll miss must not regress a live order.
      console.error('[era-checkout] getIntent failed during refresh; leaving order unchanged:', error instanceof Error ? error.name : 'unknown');
    }
  }

  const fresh = await loadBatchMembers(db, userId, batchId);
  return { orders: fresh, combined: combineOffers(membersToOffers(fresh)) };
}

/** The outcome of a confirm attempt — mappable to 200 / 404 / 409 at the route. */
export type ConfirmBatchResult =
  | { readonly ok: true; readonly orders: readonly Order[] }
  | { readonly ok: false; readonly code: 'not_found' }
  | { readonly ok: false; readonly code: 'invalid_state'; readonly orders: readonly { orderId: string; status: string }[] };

/**
 * Confirm a batch — the explicit purchase. ALL members must be awaiting_confirmation,
 * else invalid_state with a per-order status detail (route → 409). Each member is then
 * confirmed SEQUENTIALLY with the sandbox test token; a completed member clears its
 * cart row (single delete). A per-member confirm failure fails that one row and the
 * others still proceed. The sandbox gate (`ERA_CHECKOUT_SANDBOX`) is enforced at the
 * route — this is the live-payment launch seam.
 */
export async function confirmBatch(
  userId: string,
  batchId: string,
  provider: CheckoutProvider,
  db: DbClient,
): Promise<ConfirmBatchResult> {
  const members = await loadBatchMembers(db, userId, batchId);
  if (members.length === 0) {
    return { ok: false, code: 'not_found' };
  }

  const notReady = members.some((m) => m.status !== 'awaiting_confirmation');
  if (notReady) {
    return {
      ok: false,
      code: 'invalid_state',
      orders: members.map((m) => ({ orderId: m.id, status: m.status })),
    };
  }

  for (const member of members) {
    if (member.intentId === null) {
      await db.update(orders).set({ status: 'failed', failureReason: 'no_intent' }).where(eq(orders.id, member.id));
      continue;
    }
    try {
      const intent = await provider.confirmIntent(member.intentId, SANDBOX_PAYMENT);
      await db
        .update(orders)
        .set({
          status: intent.state,
          vendorOrderId: intent.vendorOrderId ?? null,
          failureReason: intent.failureReason ?? null,
          ...offerColumns(intent.offer),
        })
        .where(eq(orders.id, member.id));
      if (intent.state === 'completed') {
        // The piece is bought — drop it from the cart.
        await db.delete(cartItems).where(and(eq(cartItems.userId, userId), eq(cartItems.productId, member.productId)));
      }
    } catch (error) {
      console.error('[era-checkout] confirmIntent failed for one order; marking it failed:', error instanceof Error ? error.name : 'unknown');
      await db.update(orders).set({ status: 'failed', failureReason: 'confirm_failed' }).where(eq(orders.id, member.id));
    }
  }

  const fresh = await loadBatchMembers(db, userId, batchId);
  return { ok: true, orders: fresh };
}

/** The caller's order history, newest first — the settings-surface list. */
export async function listOrders(db: DbClient, userId: string): Promise<Order[]> {
  return db.select().from(orders).where(eq(orders.userId, userId)).orderBy(desc(orders.createdAt));
}

/**
 * Persist a fresh intent onto the order row keyed by its (globally unique) intent id —
 * the Rye webhook's write path. Returns whether a row was updated: an unknown intent id
 * matches nothing and is a no-op (the webhook drops it with a 200). No session scope is
 * needed — the intent id is the secret handle Rye returns, unique per order.
 */
export async function persistIntentByIntentId(
  db: DbClient,
  intentId: string,
  intent: { state: string; offer?: CheckoutOffer; vendorOrderId?: string; failureReason?: string },
): Promise<boolean> {
  const updated = await db
    .update(orders)
    .set({
      status: intent.state,
      vendorOrderId: intent.vendorOrderId ?? null,
      failureReason: intent.failureReason ?? null,
      ...offerColumns(intent.offer),
    })
    .where(eq(orders.intentId, intentId))
    .returning({ id: orders.id });
  return updated.length > 0;
}
