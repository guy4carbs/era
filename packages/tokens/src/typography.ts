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

export type TypeRampStep = keyof typeof typeRamp;

/**
 * fontFamilies — the two brand faces and how each platform reaches them.
 *
 * WEB uses the variable fonts directly (Fraunces with the opsz/wght/SOFT/WONK
 * axes, Geist Sans) via `next/font`, read through the `cssVar` custom properties.
 * MOBILE cannot drive variable-font axes — React Native `Text` exposes no
 * `fontVariationSettings` — so it bundles **static instances** (one baked TTF per
 * serif optical role + three Geist weights). The `mobileSerif` / `mobileSans`
 * names MUST match the family names registered with `expo-font` (which in turn
 * match the internal name table of each baked TTF in apps/mobile/assets/fonts).
 *
 * PREMIUM SWAP PATH (Canela / GT Alpina): swapping the editorial serif is a
 * one-file change — repoint `serif` + the web loader (`next/font/local`) and drop
 * the equivalent static instances under mobileSerif. Every role, size, weight,
 * leading and tracking below stays identical; only the family name moves. Do NOT
 * change the role scale to swap the face.
 */
export const fontFamilies = {
  serif: 'Fraunces',
  sans: 'Geist',
  serifFallback: 'Georgia, serif',
  sansFallback:
    "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
  // CSS custom properties the web loader defines on <html> and the web <Text> reads.
  cssVar: { serif: '--font-era-serif', sans: '--font-era-sans' },
  // Mobile static-instance family names — match apps/mobile/assets/fonts/*.ttf.
  mobileSerif: {
    largeTitle: 'Fraunces-LargeTitle', // opsz 72, wght 500, SOFT 0
    title: 'Fraunces-Title', // opsz 40, wght 500, SOFT 0
    oviAccent: 'Fraunces-OviAccent', // italic, opsz 40, wght 460, SOFT 60 (baked signature)
  },
  mobileSans: {
    regular: 'Geist-Regular', // 400
    medium: 'Geist-Medium', // 500
    semibold: 'Geist-SemiBold', // 600
  },
} as const;

export type TypeVariant =
  | 'display'
  | 'largeTitle'
  | 'title'
  | 'oviAccent'
  | 'body'
  | 'ui'
  | 'caption';

/**
 * typeRoles — the seven semantic roles from the Design Revamp §3, as data.
 *
 * A role fixes the FAMILY, default weight, italic, leading (unitless), tracking,
 * and the serif optical axes (opsz/SOFT — web reads these into
 * `font-variation-settings`; mobile ignores them and uses the baked instance).
 * SIZE is a separate concern: each role has a `defaultSize` (a `typeRamp` step),
 * and the `<Text>` components accept a `size` override (step name or px) so the
 * many existing call sites keep their exact sizes while gaining the right face.
 *
 * WONK stays 0 everywhere (reserve WONK 1 for rare marketing moments — not a role).
 */
export const typeRoles = {
  // Marketing hero + signature only. Web renders a fluid clamp; never on mobile
  // (webOnly) — if used on mobile it falls back to the largeTitle instance.
  display: {
    family: 'serif',
    italic: false,
    weight: 500, // spec 480–560
    defaultSize: 'display',
    webClamp: 'clamp(3rem, 8vw, 6.5rem)',
    leading: 1.05, // spec 1.02–1.08
    letterSpacing: '-0.02em',
    opsz: 144,
    soft: 0,
    mobileFamily: fontFamilies.mobileSerif.largeTitle,
    webOnly: true,
  },
  // Screen titles, era titles.
  largeTitle: {
    family: 'serif',
    italic: false,
    weight: 500,
    defaultSize: 'largeTitle',
    webClamp: null,
    leading: 1.15,
    letterSpacing: '-0.01em',
    opsz: 72,
    soft: 0,
    mobileFamily: fontFamilies.mobileSerif.largeTitle,
    webOnly: false,
  },
  // Section heads, card titles that deserve voice.
  title: {
    family: 'serif',
    italic: false,
    weight: 500,
    defaultSize: 'title2',
    webClamp: null,
    leading: 1.2,
    letterSpacing: '-0.01em',
    opsz: 40,
    soft: 0,
    mobileFamily: fontFamilies.mobileSerif.title,
    webOnly: false,
  },
  // Ovi's name, era names, editorial whispers. The deliberate inline serif accent —
  // allowed down to body size (exempt from the 20px serif floor), never in a control.
  oviAccent: {
    family: 'serif',
    italic: true,
    weight: 460,
    defaultSize: 'title3',
    webClamp: null,
    leading: 1.25,
    letterSpacing: null,
    opsz: 40,
    soft: 60,
    mobileFamily: fontFamilies.mobileSerif.oviAccent,
    webOnly: false,
  },
  // All reading text; line-height 1.5.
  body: {
    family: 'sans',
    italic: false,
    weight: 400,
    defaultSize: 'body',
    webClamp: null,
    leading: 1.5,
    letterSpacing: null,
    opsz: null,
    soft: 0,
    mobileFamily: fontFamilies.mobileSans.regular,
    webOnly: false,
  },
  // Buttons, chips, nav, inputs — serif is NEVER allowed here.
  ui: {
    family: 'sans',
    italic: false,
    weight: 600,
    defaultSize: 'subhead',
    webClamp: null,
    leading: 1.2,
    letterSpacing: null,
    opsz: null,
    soft: 0,
    mobileFamily: fontFamilies.mobileSans.semibold,
    webOnly: false,
  },
  // Metadata; secondary color, contrast-safe at small sizes.
  caption: {
    family: 'sans',
    italic: false,
    weight: 400,
    defaultSize: 'caption',
    webClamp: null,
    leading: 1.33,
    letterSpacing: null,
    opsz: null,
    soft: 0,
    mobileFamily: fontFamilies.mobileSans.regular,
    webOnly: false,
  },
} as const;

/**
 * serifGuard — the enforcement rule both `<Text>` components run in dev.
 *
 * Serif refuses to render below `minSerifPx` OR inside a control (Button/Chip/
 * Input). `oviAccent` is the one intentional exception to the size floor — it is
 * the inline editorial accent (Ovi's name at body size) — but it is STILL barred
 * from controls like every other serif.
 */
export const serifGuard = {
  minSerifPx: 20,
  serifVariants: ['display', 'largeTitle', 'title', 'oviAccent'],
  sizeFloorExempt: ['oviAccent'],
  controlForbidsSerif: true,
} as const;

export interface VariantCheck {
  readonly ok: boolean;
  readonly reason: string | null;
}

/** True if `variant` is one of the serif roles. */
export function isSerifVariant(variant: TypeVariant): boolean {
  return (serifGuard.serifVariants as readonly string[]).includes(variant);
}

/**
 * Resolve a role + optional size override to a pixel size. A `number` is taken as
 * px; a `TypeRampStep` reads `typeRamp`; omitted uses the role's `defaultSize`.
 * (Web `display` overrides this with a fluid clamp; the px here is its nominal
 * anchor, used only by the guard.)
 */
export function roleSizePx(variant: TypeVariant, size?: TypeRampStep | number): number {
  if (typeof size === 'number') {
    return size;
  }
  const step = size ?? typeRoles[variant].defaultSize;
  return typeRamp[step].px;
}

/** Nearest bundled Geist static instance for a CSS weight (RN has no weight axis). */
export function mobileSansFamily(weight: number): string {
  if (weight >= 600) {
    return fontFamilies.mobileSans.semibold;
  }
  if (weight >= 500) {
    return fontFamilies.mobileSans.medium;
  }
  return fontFamilies.mobileSans.regular;
}

/**
 * The guard both platforms call in dev before rendering. Returns `{ ok, reason }`
 * rather than throwing so the caller decides (web/mobile `<Text>` `console.warn`).
 * Sans variants are always allowed.
 */
export function assertVariantAllowed(
  variant: TypeVariant,
  opts: { sizePx: number | null; inControl: boolean },
): VariantCheck {
  if (!isSerifVariant(variant)) {
    return { ok: true, reason: null };
  }
  if (opts.inControl && serifGuard.controlForbidsSerif) {
    return {
      ok: false,
      reason: `serif variant "${variant}" is not allowed inside a Button/Chip/Input — use variant "ui".`,
    };
  }
  const exempt = (serifGuard.sizeFloorExempt as readonly string[]).includes(variant);
  if (!exempt && opts.sizePx !== null && opts.sizePx < serifGuard.minSerifPx) {
    return {
      ok: false,
      reason: `serif variant "${variant}" must render at ≥${serifGuard.minSerifPx}px (got ${opts.sizePx}px) — use a sans variant.`,
    };
  }
  return { ok: true, reason: null };
}
