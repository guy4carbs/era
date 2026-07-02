/**
 * Shared shapes for the closet item surfaces (grid + add/confirm flow).
 *
 * These mirror the API contract exposed by the items routes: `Item` is the row
 * as returned by process-item / PATCH, and `ItemWithDisplay` adds the signed
 * `displayUrl` that GET /api/items resolves (cutout when present, else raw).
 */

/** The garment categories, matching the `item_category` enum. */
export type ItemCategory =
  | 'top'
  | 'bottom'
  | 'dress'
  | 'outerwear'
  | 'shoes'
  | 'bag'
  | 'hat'
  | 'scarf'
  | 'watch'
  | 'jewelry'
  | 'accessory';

/** The visual pattern options offered on the confirm screen. */
export type ItemPattern =
  | 'solid'
  | 'striped'
  | 'checked'
  | 'floral'
  | 'graphic'
  | 'animal'
  | 'other';

/** A closet item as returned by the items API (sans display URL). */
export interface Item {
  id: string;
  category: ItemCategory;
  name: string;
  brand: string | null;
  colorPrimary: string | null;
  colors: string[] | null;
  pattern: ItemPattern | null;
  imageRawPath: string | null;
  imageCutoutPath: string | null;
  tagsConfirmed: boolean;
}

/** An item plus its resolved, signed display URL (GET /api/items). */
export interface ItemWithDisplay extends Item {
  displayUrl: string | null;
}

/** What the AI pipeline actually did to a freshly uploaded photo. */
export interface Processed {
  /** Background removed → a cutout exists. */
  bg: boolean;
  /** Vision tagging produced category/colour/pattern guesses. */
  vision: boolean;
}

/** The six user-editable fields on the confirm screen, in display order. */
export type EditableField =
  | 'category'
  | 'name'
  | 'brand'
  | 'colorPrimary'
  | 'colors'
  | 'pattern';

/**
 * The changed-only patch sent on confirm. Every key is optional; we send just
 * the fields the user actually touched (see ConfirmItem's diff).
 */
export interface ItemEdits {
  category?: ItemCategory;
  name?: string;
  brand?: string;
  colorPrimary?: string;
  colors?: string[];
  pattern?: ItemPattern;
}
