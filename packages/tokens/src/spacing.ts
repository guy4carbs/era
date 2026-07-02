/**
 * spacing — a 4pt base-unit scale.
 *
 * Every layout gap is a multiple of `baseUnit` (4). Names encode the multiple:
 * s2 = 2 * 4 = 8, s6 = 6 * 4 = 24, and so on.
 */

export const baseUnit = 4 as const;

export const spacing = {
  s1: 4, //  1 * 4
  s2: 8, //  2 * 4
  s3: 12, //  3 * 4
  s4: 16, //  4 * 4
  s6: 24, //  6 * 4
  s8: 32, //  8 * 4
  s12: 48, // 12 * 4
  s16: 64, // 16 * 4
} as const;
