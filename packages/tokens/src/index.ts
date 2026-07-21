/**
 * @era/tokens — design tokens for the Era aesthetic.
 *
 * Warm cream/black base, glassy surfaces, soft accent glow, and spring-driven
 * motion. Every value is frozen with `as const` so it carries its literal type,
 * and every number traces back to the design spec (see each module's comments).
 *
 * The barrel below re-exports every token group. Contrast declarations are
 * audited by `runContrastAudit()` and enforced in CI (see `./contrast.ts`).
 */

export { palette, type ThemeMode } from './colors.ts';
export { baseUnit, spacing } from './spacing.ts';
export { radii } from './radii.ts';
export {
  typeRamp,
  fontFamilies,
  typeRoles,
  serifGuard,
  isSerifVariant,
  roleSizePx,
  mobileSansFamily,
  assertVariantAllowed,
  type TypeRampStep,
  type TypeVariant,
  type VariantCheck,
} from './typography.ts';
export {
  elevation,
  elevationDark,
  boxShadows,
  boxShadowsDark,
  rnShadow,
  type ElevationLevel,
  type RnShadow,
} from './elevation.ts';
export { glass } from './glass.ts';
export { glow } from './glow.ts';
export { orb } from './orb.ts';
export { sheen } from './sheen.ts';
export { motion } from './motion.ts';
export { layout } from './layout.ts';
export {
  relativeLuminance,
  contrastRatio,
  compositeOver,
  contrastPairs,
  runContrastAudit,
  type ContrastUsage,
  type ContrastPair,
  type ContrastAuditRow,
} from './contrast.ts';
