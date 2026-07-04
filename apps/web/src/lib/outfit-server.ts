/**
 * Server-only helpers shared across the outfit + era API routes: transform
 * validation (matching the pinned outfit_items contract), owner-scoped item
 * lookups, and the full "reopen" shaping that resolves cover + member-item
 * display URLs. Never import from a client bundle — it pulls in the R2 client.
 */
import { and, asc, eq, getTableColumns, inArray } from 'drizzle-orm';

import { type AssetBucket, type AuthContext, type StorageClient, getAssetUrl } from '@era/core';
import { type DbClient, type Item, items, outfitItems } from '@era/db';

/** A validated canvas-placement for one item within an outfit. */
export interface OutfitItemInput {
  itemId: string;
  layerOrder: number;
  posX: number;
  posY: number;
  scale: number;
  rotation: number;
}

/** Owner passed to getAssetUrl: privacy governs public-vs-signed resolution. */
export interface AssetOwner {
  userId: string;
  isPrivate: boolean;
}

// Pinned contract bounds. items in an outfit: 1..30.
const MIN_ITEMS = 1;
const MAX_ITEMS = 30;
const SCALE_MIN = 0.05;
const SCALE_MAX = 10;
const ROTATION_MIN = -360;
const ROTATION_MAX = 360;

// Length caps for user-supplied outfit/era text (Sentinel LOW: bound stored text).
export const OUTFIT_NAME_MAX = 120;
export const OUTFIT_OCCASION_MAX = 80;
export const ERA_TITLE_MAX = 80;
export const ERA_DESCRIPTION_MAX = 300;
export const ERA_SEASON_MAX = 20;
// R2 object keys are `{userId}/{uuid}.{ext}` — comfortably under this bound.
export const COVER_KEY_MAX = 1024;

// items.id is a pg `uuid`: a non-UUID itemId would reach `inArray(...)` and
// surface as a Postgres "invalid input syntax for type uuid" 500 instead of a
// clean 400. Reject at parse time — this also bounds the itemId string length.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Still-image extensions the cover-url route mints keys for.
const COVER_EXT = 'png|jpg|jpeg|webp';

const OUTFIT_ITEM_FIELDS = ['itemId', 'layerOrder', 'posX', 'posY', 'scale', 'rotation'];

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

/**
 * Parse an optional text field from a request body. `undefined` value means the
 * key was absent (leave as-is); `null` means an explicit clear; a string must be
 * non-empty and within `max`. Returns `{ ok: false }` when the value is present
 * but malformed so the route can answer 400.
 */
export type TextResult = { ok: true; value: string | null | undefined } | { ok: false };

export function optionalText(root: Record<string, unknown>, key: string, max: number): TextResult {
  if (!(key in root) || root[key] === undefined) {
    return { ok: true, value: undefined };
  }
  const value = root[key];
  if (value === null) {
    return { ok: true, value: null };
  }
  if (typeof value !== 'string' || value.length === 0 || value.length > max) {
    return { ok: false };
  }
  return { ok: true, value };
}

/**
 * Validate an outfit's items array against the pinned contract without zod
 * (not a dependency of apps/web). Returns the parsed placements, or null when
 * the array is the wrong size, an entry is malformed, a transform is out of
 * range, or an itemId repeats (a duplicate would violate the outfit_items PK).
 */
export function parseOutfitItems(value: unknown): OutfitItemInput[] | null {
  if (!Array.isArray(value) || value.length < MIN_ITEMS || value.length > MAX_ITEMS) {
    return null;
  }
  const out: OutfitItemInput[] = [];
  const seen = new Set<string>();
  for (const raw of value) {
    if (typeof raw !== 'object' || raw === null) {
      return null;
    }
    const entry = raw as Record<string, unknown>;
    for (const key of Object.keys(entry)) {
      if (!OUTFIT_ITEM_FIELDS.includes(key)) {
        return null;
      }
    }
    const { itemId, layerOrder, posX, posY, scale, rotation } = entry;
    if (typeof itemId !== 'string' || !UUID_RE.test(itemId) || seen.has(itemId)) {
      return null;
    }
    if (!Number.isInteger(layerOrder) || (layerOrder as number) < 0) {
      return null;
    }
    if (!isFiniteNumber(posX) || posX < 0 || posX > 1) {
      return null;
    }
    if (!isFiniteNumber(posY) || posY < 0 || posY > 1) {
      return null;
    }
    if (!isFiniteNumber(scale) || scale < SCALE_MIN || scale > SCALE_MAX) {
      return null;
    }
    if (!isFiniteNumber(rotation) || rotation < ROTATION_MIN || rotation > ROTATION_MAX) {
      return null;
    }
    seen.add(itemId);
    // layerOrder is validated by Number.isInteger, which does not narrow the type.
    out.push({ itemId, layerOrder: layerOrder as number, posX, posY, scale, rotation });
  }
  return out;
}

/**
 * True when `key` is a cover object the caller could have uploaded: it must sit
 * directly under the caller's `{userId}/` prefix AND match the exact
 * `{userId}/{uuid}.{ext}` shape the cover-url route mints. A bare
 * `startsWith(`${userId}/`)` check let a crafted `${userId}/../../otherKey` pass
 * — the `..` reject plus the anchored format check close that traversal. userId
 * is escaped because `users.id` is free-form text, not a UUID.
 */
export function isOwnedCoverKey(key: string, userId: string): boolean {
  if (key.includes('..')) {
    return false;
  }
  const escaped = userId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`^${escaped}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\\.(${COVER_EXT})$`, 'i');
  return re.test(key);
}

/**
 * Parse a bare itemId array — the shape an Ovi proposal carries (ids only, no
 * canvas placements) — without zod. Every entry must be a UUID string; the
 * result is de-duplicated (first-seen order preserved) so it can't violate the
 * outfit_items PK. Returns null when the value is not an array, is longer than
 * `max`, holds a non-UUID entry, or de-dupes to fewer than `min` ids. The raw
 * length is capped before iterating so an oversized array is rejected cheaply.
 */
export function parseItemIds(value: unknown, min: number, max: number): string[] | null {
  if (!Array.isArray(value) || value.length > max) {
    return null;
  }
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of value) {
    if (typeof raw !== 'string' || !UUID_RE.test(raw)) {
      return null;
    }
    if (!seen.has(raw)) {
      seen.add(raw);
      out.push(raw);
    }
  }
  if (out.length < min) {
    return null;
  }
  return out;
}

/**
 * True when every id in `itemIds` names an item owned by `userId`. The caller
 * must pass a de-duplicated list (parseOutfitItems guarantees this): a foreign
 * or missing id makes the owned count fall short, so no cross-user item can
 * enter an outfit.
 */
export async function allItemsOwnedBy(db: DbClient, userId: string, itemIds: string[]): Promise<boolean> {
  if (itemIds.length === 0) {
    return false;
  }
  const rows = await db
    .select({ id: items.id })
    .from(items)
    .where(and(inArray(items.id, itemIds), eq(items.userId, userId)));
  return rows.length === itemIds.length;
}

/** Resolve an item's best display URL (cutout over raw), or null when imageless. */
export async function itemDisplayUrl(
  storage: StorageClient,
  ctx: AuthContext,
  item: Pick<Item, 'imageCutoutPath' | 'imageRawPath'>,
  owner: AssetOwner,
): Promise<string | null> {
  const cutout = item.imageCutoutPath;
  const key = cutout ?? item.imageRawPath;
  if (!key) {
    return null;
  }
  const bucket: AssetBucket = cutout ? 'items-cutout' : 'items-raw';
  return getAssetUrl(storage, ctx, { bucket, key, owner });
}

/** Resolve an outfit-covers key to a URL, or null when there is no cover. */
export async function coverUrl(
  storage: StorageClient,
  ctx: AuthContext,
  key: string | null,
  owner: AssetOwner,
): Promise<string | null> {
  if (!key) {
    return null;
  }
  return getAssetUrl(storage, ctx, { bucket: 'outfit-covers', key, owner });
}

/** One member of the full outfit "reopen" shape. */
export interface OutfitMember extends OutfitItemInput {
  item: Item & { displayUrl: string | null };
}

/**
 * The full reopen payload for a single outfit: the row plus coverUrl and its
 * ordered members, each joined to its item with a resolved displayUrl. This is
 * what the canvas reopens from. `owner` is the outfit owner (always the caller
 * on these routes), used to sign every asset.
 */
export async function shapeOutfitDetail<T extends { id: string; coverImagePath: string | null }>(
  db: DbClient,
  storage: StorageClient,
  ctx: AuthContext,
  outfit: T,
  owner: AssetOwner,
): Promise<T & { coverUrl: string | null; items: OutfitMember[] }> {
  const rows = await db
    .select({
      itemId: outfitItems.itemId,
      layerOrder: outfitItems.layerOrder,
      posX: outfitItems.posX,
      posY: outfitItems.posY,
      scale: outfitItems.scale,
      rotation: outfitItems.rotation,
      item: getTableColumns(items),
    })
    .from(outfitItems)
    .innerJoin(items, eq(outfitItems.itemId, items.id))
    .where(eq(outfitItems.outfitId, outfit.id))
    .orderBy(asc(outfitItems.layerOrder));

  const members: OutfitMember[] = await Promise.all(
    rows.map(async (row) => ({
      itemId: row.itemId,
      layerOrder: row.layerOrder,
      posX: row.posX,
      posY: row.posY,
      scale: row.scale,
      rotation: row.rotation,
      item: { ...row.item, displayUrl: await itemDisplayUrl(storage, ctx, row.item, owner) },
    })),
  );

  return { ...outfit, coverUrl: await coverUrl(storage, ctx, outfit.coverImagePath, owner), items: members };
}

/** Replace an outfit's entire outfit_items set within a transaction-like pair. */
export async function replaceOutfitItems(db: DbClient, outfitId: string, members: OutfitItemInput[]): Promise<void> {
  await db.delete(outfitItems).where(eq(outfitItems.outfitId, outfitId));
  await db.insert(outfitItems).values(members.map((m) => ({ outfitId, ...m })));
}
