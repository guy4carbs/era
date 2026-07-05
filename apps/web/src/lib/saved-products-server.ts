/**
 * Server-only persistence for the Shop wishlist (save-for-later). A saved row is
 * a denormalized snapshot of a `ShopProduct` at save time — Shop feeds are
 * external with no table to FK to — so the whole product card is captured on the
 * row and read back as a render-friendly {@link SavedShopProduct}.
 *
 * Every write/read is owner-scoped (the routes authorize through the `@era/core`
 * `canInsertSavedProduct` / `canDeleteSavedProduct` / `canReadSavedProduct`
 * guards); these helpers additionally filter by `userId` so a query can only ever
 * touch the caller's own rows. Save is idempotent — a second save of the same
 * product is a no-op via the `(user_id, product_id)` unique constraint. Never
 * import from a client bundle (holds the DB client).
 */
import { and, desc, eq } from 'drizzle-orm';

import { type SavedShopProduct, type ShopProduct } from '@era/core/shop';
import { type DbClient, type NewSavedProduct, type SavedProduct, savedProducts } from '@era/db';

/** Map a validated `ShopProduct` to the row we persist under `userId`. */
export function toSavedProductRow(userId: string, product: ShopProduct): NewSavedProduct {
  return {
    userId,
    productId: product.id,
    retailer: product.retailer,
    title: product.title,
    brand: product.brand,
    category: product.category,
    imageUrl: product.imageUrl,
    productUrl: product.productUrl,
    affiliateUrl: product.affiliateUrl,
    currency: product.currency,
    // numeric column — Drizzle takes the snapshot as a string.
    priceSnapshot: String(product.price),
  };
}

/** Map a stored row to the render-friendly shape the clients consume. */
export function toSavedShopProduct(row: SavedProduct): SavedShopProduct {
  return {
    id: row.productId,
    title: row.title,
    brand: row.brand,
    category: row.category,
    price: Number(row.priceSnapshot),
    currency: row.currency,
    imageUrl: row.imageUrl,
    retailer: row.retailer,
    productUrl: row.productUrl,
    affiliateUrl: row.affiliateUrl,
  };
}

/**
 * Save a product for `userId`. Idempotent: a re-save of the same
 * `(userId, productId)` is dropped by the unique constraint via
 * `onConflictDoNothing`, so calling twice leaves exactly one row.
 */
export async function saveProduct(db: DbClient, userId: string, product: ShopProduct): Promise<void> {
  await db
    .insert(savedProducts)
    .values(toSavedProductRow(userId, product))
    .onConflictDoNothing({ target: [savedProducts.userId, savedProducts.productId] });
}

/** Remove `productId` from `userId`'s saves. A no-op when nothing is saved. */
export async function unsaveProduct(db: DbClient, userId: string, productId: string): Promise<void> {
  await db
    .delete(savedProducts)
    .where(and(eq(savedProducts.userId, userId), eq(savedProducts.productId, productId)));
}

/** List `userId`'s saved products, newest first, in the client-facing shape. */
export async function listSavedProducts(db: DbClient, userId: string): Promise<SavedShopProduct[]> {
  const rows = await db
    .select()
    .from(savedProducts)
    .where(eq(savedProducts.userId, userId))
    .orderBy(desc(savedProducts.createdAt));
  return rows.map(toSavedShopProduct);
}
