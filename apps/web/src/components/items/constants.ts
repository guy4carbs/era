/**
 * Fixed option sets for the confirm screen's field editors.
 *
 * NOTE: these are DATA, not design tokens. `CATEGORY_OPTIONS` and
 * `PATTERN_OPTIONS` are the domain enums the API accepts; `COLOR_WORDS` is a
 * short list of everyday garment colour words offered as one-tap chips for the
 * primary colour and the colours multi-select. They are intentionally plain
 * strings (garment vocabulary), distinct from the themed `--color-*` tokens.
 */
import type { ItemCategory, ItemPattern } from './types';

/** Category chips, in the order they read on the editor row. */
export const CATEGORY_OPTIONS: readonly ItemCategory[] = [
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
];

/** Pattern chips. */
export const PATTERN_OPTIONS: readonly ItemPattern[] = [
  'solid',
  'striped',
  'checked',
  'floral',
  'graphic',
  'animal',
  'other',
];

/** Common garment colour words (data, not the themed colour tokens). */
export const COLOR_WORDS: readonly string[] = [
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
];
