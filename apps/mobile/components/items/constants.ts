/**
 * Item taxonomy — the fixed option sets the closet uses.
 *
 * Every list here mirrors the server enums (`packages/db` item_category /
 * pattern) and the web confirm editor exactly; the two must stay in lockstep so
 * a value tagged on one platform is always editable on the other. Kept as
 * `as const` tuples so each derives its own literal-union type.
 */

/** The eleven garment categories (item_category enum, in enum order). */
export const CATEGORIES = [
  'top',
  'bottom',
  'dress',
  'outerwear',
  'shoes',
  'bag',
  'hat',
  'scarf',
  'watch',
  'jewelry',
  'accessory',
] as const;

export type ItemCategory = (typeof CATEGORIES)[number];

/** The seven surface patterns. */
export const PATTERNS = [
  'solid',
  'striped',
  'checked',
  'floral',
  'graphic',
  'animal',
  'other',
] as const;

export type ItemPattern = (typeof PATTERNS)[number];

/**
 * The twelve color words offered for an item's main color. This is a controlled
 * vocabulary, not a hex picker — it mirrors the web list exactly and MUST be
 * kept identical there, so a color chosen on either platform round-trips.
 */
export const COLOR_WORDS = [
  'black',
  'white',
  'grey',
  'navy',
  'blue',
  'green',
  'red',
  'burgundy',
  'brown',
  'tan',
  'cream',
  'pink',
] as const;
