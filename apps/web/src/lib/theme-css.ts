/**
 * Server-safe generation of the Era theme's CSS custom properties.
 *
 * Every value here is derived FROM `@era/tokens` — this module is the single
 * place where raw token numbers become `px`/CSS units. Components never emit
 * literal dimensions; they read the `var(--…)` names produced below. That keeps
 * component code free of hardcoded design values and makes the whole surface
 * theme-reactive: switching `data-theme` on <html> swaps the colour set with no
 * React re-render.
 *
 * Not a client module on purpose — the layout injects the generated <style> and
 * the no-flash <script> during SSR so colours are correct on first paint.
 */
import {
  palette,
  radii,
  spacing,
  glass,
  glow,
  layout,
} from '@era/tokens';

/** Numbers become `px`; strings pass through (some tokens ship pre-unit'd). */
function unit(value: unknown): string {
  return typeof value === 'number' ? `${value}px` : String(value);
}

type ColorMode = 'light' | 'dark';

/** The seven themed colour roles, mapped to `--color-*` custom properties. */
function paletteVars(mode: ColorMode): string {
  const p = palette[mode];
  return [
    `--color-bg:${p.bg}`,
    `--color-surface:${p.surface}`,
    `--color-text:${p.text}`,
    `--color-secondary:${p.secondary}`,
    `--color-secondary-strong:${p.secondaryStrong}`,
    `--color-accent:${p.accent}`,
    `--color-hairline:${p.hairline}`,
    // Glass surface tint is mode-specific (light 0.7 / dark 0.6); expose it as a
    // percentage so component color-mix() reads one var and stays mode-reactive.
    `--glass-tint:${Math.round(glass.tintOpacity[mode] * 100)}%`,
  ].join(';');
}

/** Theme-independent tokens: semantic colours, radii, spacing, dimensions. */
function baseVars(): string {
  const semantic = [
    `--color-sage:${palette.semantic.sage}`,
    `--color-rust:${palette.semantic.rust}`,
    `--color-ink:${palette.ink}`,
  ];

  const radiiVars = Object.entries(radii).map(
    ([key, value]) => `--radius-${key}:${unit(value)}`,
  );

  const spacingVars = Object.entries(spacing).map(
    ([key, value]) => `--space-${key.slice(1)}:${unit(value)}`,
  );

  const touch = layout.touchTarget;
  const touchMin = typeof touch === 'number' ? touch : touch.webMin;
  const touchWeb =
    typeof touch === 'number' ? touch : (touch.webPreferred ?? touch.webMin);
  const itemCardPadding =
    typeof layout.itemCard === 'number'
      ? layout.itemCard
      : layout.itemCard.padding;

  const dimensionVars = [
    `--touch-target-min:${unit(touchMin)}`,
    `--touch-target-web:${unit(touchWeb)}`,
    `--tabbar-height:${unit(layout.tabBarHeight)}`,
    `--header-height:${unit(layout.headerHeight)}`,
    `--content-max:${unit(layout.contentMaxWidth)}`,
    `--feed-col:${unit(layout.feedColumnWidth)}`,
    // Desktop left-rail width — composed from spacing tokens (no literal px).
    `--rail-width:calc(var(--space-16) + var(--space-8))`,
    `--item-card-padding:${unit(itemCardPadding)}`,
    `--hover-lift:${unit(layout.hover.liftPx)}`,
    `--glass-blur:${unit(glass.blur)}`,
    `--glass-border-width:${unit(glass.borderWidth)}`,
    `--glow-blur:${unit(glow.blurRadius)}`,
  ];

  return [...semantic, ...radiiVars, ...spacingVars, ...dimensionVars].join(';');
}

/**
 * The full stylesheet: base tokens on :root, then a colour set per data-theme.
 * `light` doubles as the :root default for the pre-hydration frame.
 */
export const themeVarsCss = [
  `:root{${baseVars()}}`,
  `:root,[data-theme='light']{${paletteVars('light')}}`,
  `[data-theme='dark']{${paletteVars('dark')}}`,
].join('\n');

/**
 * Responsive rules that need real media queries (which cannot read CSS vars in
 * their conditions) — generated from the token breakpoints. The primary-nav
 * chrome swaps at `lg`: below it the bottom tab bar shows (phone/tablet); at and
 * above it the tab bar hides and the left rail takes over, with the shell inset
 * for the rail's width. Everything else stays token-driven via the vars above.
 */
export const responsiveCss = [
  `.era-container{width:100%;margin-inline:auto;max-width:var(--content-max);padding-inline:var(--space-4)}`,
  `.era-tabbar{display:flex}`,
  `.era-rail{display:none}`,
  `.era-tabs-shell{padding-bottom:calc(var(--tabbar-height) + var(--space-16))}`,
  `@media (min-width:${layout.breakpoints.lg}px){` +
    `.era-tabbar{display:none}` +
    `.era-rail{display:flex}` +
    `.era-tabs-shell{padding-bottom:var(--space-8);padding-left:var(--rail-width)}` +
    `}`,
].join('\n');

/**
 * Inline IIFE for the <head>: resolves the stored preference (or system) and
 * sets `data-theme` before first paint so there is no light/dark flash.
 */
export const noFlashScript = `(function(){try{var s=localStorage.getItem('era-theme');var m=s||'system';var r=m==='system'?(window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'):m;document.documentElement.dataset.theme=r;}catch(e){document.documentElement.dataset.theme='light';}})();`;
