/**
 * Server-only "shop similar from my closet" for a feed post. This is the trust
 * rule carried into the feed: before Shop ever suggests buying, Era shows what the
 * viewer ALREADY owns that would wear in the posted look's place. Deterministic,
 * no LLM — the matching is @era/core's pure {@link matchOutfitToCloset}; this
 * module only loads the two item sets and resolves the VIEWER's own display URLs.
 *
 * The posted look's items come from the post's subject (an outfit's items, or an
 * era's outfits' items unioned + capped). The closet is the viewer's own
 * non-archived items. Only the viewer's items ever get a resolved URL — the posted
 * items are echoed back as `{category, colors}` for context, never with a storage
 * key. Never import from a client bundle — it talks to the database and R2.
 */
import { and, eq } from 'drizzle-orm';

import { type AuthContext, type StorageClient } from '@era/core';
import { matchOutfitToCloset } from '@era/core/outfit-matching';
import { type OviItem } from '@era/core/ovi';
import { type DbClient, eraOutfits, items, outfitItems, profiles } from '@era/db';

import { OVI_ITEMS_CAP } from './ovi-server.ts';
import { type AssetOwner, itemDisplayUrl } from './outfit-server.ts';

/** Distinct items pulled from an era's outfits are capped — a look, not a catalog. */
const MAX_POSTED_ITEMS = 30;

/** Coerce an unknown jsonb value into a clean string array (mirrors ovi-server). */
function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((entry): entry is string => typeof entry === 'string');
}

/** The item columns both the posted look and the closet load — the OviItem slice. */
const OVI_ITEM_COLUMNS = {
  id: items.id,
  category: items.category,
  colors: items.colors,
  pattern: items.pattern,
  brand: items.brand,
} as const;

function toOviItem(row: { id: string; category: string; colors: unknown; pattern: string | null; brand: string | null }): OviItem {
  return { id: row.id, category: row.category, colors: toStringArray(row.colors), pattern: row.pattern, brand: row.brand };
}

/** Load an outfit's items as the OviItem slice (capped; an outfit is ≤30 already). */
async function loadPostedOutfitItems(db: DbClient, outfitId: string): Promise<OviItem[]> {
  const rows = await db
    .select(OVI_ITEM_COLUMNS)
    .from(outfitItems)
    .innerJoin(items, eq(outfitItems.itemId, items.id))
    .where(eq(outfitItems.outfitId, outfitId))
    .limit(MAX_POSTED_ITEMS);
  return rows.map(toOviItem);
}

/**
 * Load the DISTINCT items across an era's outfits as the OviItem slice, capped at
 * {@link MAX_POSTED_ITEMS}. `selectDistinct` dedupes an item that appears in more
 * than one of the era's outfits so it's matched once, not once per outfit.
 */
async function loadPostedEraItems(db: DbClient, eraId: string): Promise<OviItem[]> {
  const rows = await db
    .selectDistinct(OVI_ITEM_COLUMNS)
    .from(eraOutfits)
    .innerJoin(outfitItems, eq(eraOutfits.outfitId, outfitItems.outfitId))
    .innerJoin(items, eq(outfitItems.itemId, items.id))
    .where(eq(eraOutfits.eraId, eraId))
    .limit(MAX_POSTED_ITEMS);
  return rows.map(toOviItem);
}

/** The viewer's own item, with the extra fields a display card needs. */
interface ClosetAsset {
  readonly name: string;
  readonly imageCutoutPath: string | null;
  readonly imageRawPath: string | null;
}

/**
 * Load the viewer's non-archived closet twice-shaped in ONE query: the OviItem
 * slice the matcher scores over, and an id→asset map (name + image paths) for
 * resolving each matched item's display URL afterward. Capped at
 * {@link OVI_ITEMS_CAP}, the same bound Ovi uses.
 */
async function loadViewerCloset(db: DbClient, viewerId: string): Promise<{ ovi: OviItem[]; assets: Map<string, ClosetAsset> }> {
  const rows = await db
    .select({
      id: items.id,
      category: items.category,
      colors: items.colors,
      pattern: items.pattern,
      brand: items.brand,
      name: items.name,
      imageCutoutPath: items.imageCutoutPath,
      imageRawPath: items.imageRawPath,
    })
    .from(items)
    .where(and(eq(items.userId, viewerId), eq(items.archived, false)))
    .limit(OVI_ITEMS_CAP);

  const ovi = rows.map(toOviItem);
  const assets = new Map<string, ClosetAsset>(
    rows.map((row) => [row.id, { name: row.name, imageCutoutPath: row.imageCutoutPath, imageRawPath: row.imageRawPath }]),
  );
  return { ovi, assets };
}

/** One matched closet item as the shop-similar wire shape. */
export interface ShopSimilarMatch {
  readonly itemId: string;
  readonly name: string;
  readonly category: string;
  readonly imageUrl: string | null;
  readonly score: number;
  readonly reasons: readonly string[];
}

/** One posted-item slot with the viewer's top matching closet pieces. */
export interface ShopSimilarSlot {
  readonly slot: string;
  readonly posted: { readonly category: string; readonly colors: readonly string[] };
  readonly matches: readonly ShopSimilarMatch[];
}

/** The post's subject, as the caller already resolved it (exactly one non-null). */
export interface ShopSimilarSubject {
  readonly outfitId: string | null;
  readonly eraId: string | null;
}

/**
 * Assemble the shop-similar slots for a post as seen by `viewerId`. Loads the
 * posted look's items and the viewer's closet, runs the pure matcher, then
 * resolves each matched (VIEWER-owned) item's display URL with the viewer as the
 * asset owner. The caller MUST have already gated the post (existence + block) via
 * `loadPostForViewer`; this trusts the subject it's handed.
 *
 * An empty closet yields slots with empty `matches` (never a throw) so the client
 * can show its "nothing yet — find the gap in Shop" empty state.
 */
export async function loadShopSimilar(
  db: DbClient,
  storage: StorageClient,
  viewerId: string,
  subject: ShopSimilarSubject,
): Promise<ShopSimilarSlot[]> {
  const posted = subject.outfitId
    ? await loadPostedOutfitItems(db, subject.outfitId)
    : await loadPostedEraItems(db, subject.eraId as string);

  const closet = await loadViewerCloset(db, viewerId);

  // The viewer's own items: resolve URLs against the viewer's real privacy so a
  // public cutout serves an unsigned URL and a private one a signed GET — either
  // way the viewer is always authorized to see their own item.
  const [profile] = await db.select({ isPrivate: profiles.isPrivate }).from(profiles).where(eq(profiles.userId, viewerId)).limit(1);
  const owner: AssetOwner = { userId: viewerId, isPrivate: profile?.isPrivate ?? true };
  const ctx: AuthContext = { userId: viewerId };

  const slots = matchOutfitToCloset(posted, closet.ovi);

  return Promise.all(
    slots.map(async (slot): Promise<ShopSimilarSlot> => ({
      slot: slot.slot,
      posted: { category: slot.posted.category, colors: slot.posted.colors },
      matches: await Promise.all(
        slot.matches.map(async (match): Promise<ShopSimilarMatch> => {
          const asset = closet.assets.get(match.item.id);
          return {
            itemId: match.item.id,
            name: asset?.name ?? '',
            category: match.item.category,
            imageUrl: asset ? await itemDisplayUrl(storage, ctx, asset, owner) : null,
            score: match.score,
            reasons: match.reasons,
          };
        }),
      ),
    })),
  );
}
