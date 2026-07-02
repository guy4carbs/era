/**
 * typography — the Era type ramp.
 *
 * `body` is the HIG anchor at 17pt; every other step is a named offset from it.
 * Each entry carries:
 *   - pt:  point size for native (iOS/RN). `display` is web-only, so pt is null.
 *   - px:  pixel size (pt and px are 1:1 at 1x density).
 *   - rem: px / 16, as a CSS string.
 *   - lineHeight: round(px * 1.3). The 1.3 multiplier is our documented default
 *     — the spec does not fix a line height, so this is the house value.
 */

export const typeRamp = {
  caption: { pt: 12, px: 12, rem: '0.75rem', lineHeight: 16 }, // round(12 * 1.3) = 16
  footnote: { pt: 13, px: 13, rem: '0.8125rem', lineHeight: 17 }, // round(13 * 1.3) = 17
  subhead: { pt: 15, px: 15, rem: '0.9375rem', lineHeight: 20 }, // round(15 * 1.3) = 20
  // body — HIG anchor, 17pt.
  body: { pt: 17, px: 17, rem: '1.0625rem', lineHeight: 22 }, // round(17 * 1.3) = 22
  title3: { pt: 20, px: 20, rem: '1.25rem', lineHeight: 26 }, // round(20 * 1.3) = 26
  title2: { pt: 22, px: 22, rem: '1.375rem', lineHeight: 29 }, // round(22 * 1.3) = 29
  title1: { pt: 28, px: 28, rem: '1.75rem', lineHeight: 36 }, // round(28 * 1.3) = 36
  // largeTitle — a serif face is allowed here for editorial "era" titles.
  largeTitle: { pt: 34, px: 34, rem: '2.125rem', lineHeight: 44 }, // round(34 * 1.3) = 44
  // display — web hero only (pt: null). ~34 * phi (34 * 1.618 ~= 55).
  display: { pt: null, px: 55, rem: '3.4375rem', lineHeight: 72 }, // round(55 * 1.3) = 72
} as const;
