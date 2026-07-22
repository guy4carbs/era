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
  orb,
  layout,
  boxShadows,
  boxShadowsDark,
  sheen,
  motion,
} from '@era/tokens';

/** Numbers become `px`; strings pass through (some tokens ship pre-unit'd). */
function unit(value: unknown): string {
  return typeof value === 'number' ? `${value}px` : String(value);
}

type ColorMode = 'light' | 'dark';

/**
 * The per-mode custom properties as a plain record: `--var` name → value. This
 * is the single source of truth for everything that swaps with `data-theme` —
 * both the CSS string (`paletteVars`) and the React inline-style object
 * (`themeVarStyle`) are projections of this same record, so they can never
 * drift. Add a mode-reactive var HERE and both consumers pick it up.
 */
function paletteVarRecord(mode: ColorMode): Record<string, string> {
  const p = palette[mode];
  const shadows = mode === 'dark' ? boxShadowsDark : boxShadows;
  return {
    '--color-bg': p.bg,
    '--color-surface': p.surface,
    '--color-text': p.text,
    '--color-secondary': p.secondary,
    '--color-secondary-strong': p.secondaryStrong,
    '--color-accent': p.accent,
    '--color-hairline': p.hairline,
    // Glass surface tint is mode-specific (light 0.72 / dark 0.62); expose it as
    // a percentage so component color-mix() reads one var and stays reactive.
    '--glass-tint': `${Math.round(glass.tintOpacity[mode] * 100)}%`,
    // Busy tint — the AA-guaranteed scrim strength for glass floating over BUSY
    // imagery (cutouts / try-on renders / photos). Surfaces opt in via a `busy`
    // prop and swap `--glass-tint` → this. Dark rises 0.62 → 0.88 (AA over any
    // backdrop); light is already AA at 0.72, so it is unchanged.
    '--glass-tint-busy': `${Math.round(glass.busyTintOpacity[mode] * 100)}%`,
    // Glass frame + top-edge catch-light, per mode (§3): border warm ink/cream
    // at 8%; highlight bright white on light, barely-there on dark.
    '--glass-border': glass.border[mode],
    '--glass-highlight': glass.innerHighlightColor[mode],
    // Elevation — themed box-shadow strings. Dark uses the warm-ink +opacity
    // recipes (e4 true black); light uses the base recipes.
    '--shadow-e1': shadows.e1,
    '--shadow-e2': shadows.e2,
    '--shadow-e3': shadows.e3,
    '--shadow-e4': shadows.e4,
    // Sheen — the ready-made 135deg specular gradient for this mode.
    '--sheen-gradient': sheen.gradient[mode],
  };
}

/** The per-mode custom properties as a `;`-joined CSS declaration string. */
function paletteVars(mode: ColorMode): string {
  return Object.entries(paletteVarRecord(mode))
    .map(([name, value]) => `${name}:${value}`)
    .join(';');
}

/**
 * The per-mode custom properties as a React inline-style object (keys are the
 * `--var` names — React passes custom properties through untouched). Powers the
 * Design Lab's side-by-side theme islands: a `<div style={themeVarStyle(mode)}>`
 * re-scopes every mode-reactive var to that mode for its subtree, independent of
 * the page's own `data-theme`. Shares `paletteVarRecord`, so it is byte-for-byte
 * consistent with the CSS emitted for `data-theme`.
 */
export function themeVarStyle(mode: ColorMode): Record<string, string> {
  return paletteVarRecord(mode);
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
    // Desktop left-rail width — the D5 nav rail token (232px).
    `--rail-width:${unit(layout.rail.width)}`,
    `--rail-dot:${unit(layout.rail.glowDotPx)}`,
    `--rail-orb:${unit(layout.rail.orbPx)}`,
    `--item-card-padding:${unit(itemCardPadding)}`,
    // D7 Item Engine — hero lift + the 1% harmonizing warm tone.
    `--item-lift:${unit(layout.itemCard.lift.yPx)}`,
    `--item-lift-scale:${layout.itemCard.lift.scale}`,
    `--item-warm-tone:${layout.itemCard.warmToneOpacity}`,
    // D6 spatial rhythm — section air ≈ phi × header-below air (52/32).
    `--rhythm-header-below:${unit(layout.rhythm.headerBelowPx)}`,
    `--rhythm-section-above:${unit(layout.rhythm.sectionAbovePx)}`,
    `--hover-lift:${unit(layout.hover.liftPx)}`,
    `--glass-blur:${unit(glass.blur)}`,
    `--glass-border-width:${unit(glass.borderWidth)}`,
    // Saturation boost behind glass so garments glow through it (§3). Unitless —
    // feeds `backdrop-filter: blur(var(--glass-blur)) saturate(var(--glass-saturate))`.
    `--glass-saturate:${glass.saturate}`,
    `--glow-blur:${unit(glow.blurRadius)}`,
    // Ovi's living orb — the three canonical sizes plus its dimensional trims.
    `--orb-corner:${unit(orb.size.cornerPx)}`,
    `--orb-header:${unit(orb.size.headerPx)}`,
    `--orb-panel:${unit(orb.size.panelPx)}`,
    // The ambient-suggestion strip's whisper orb (D-AMBIENT): the smallest,
    // non-interactive presence Ovi holds beyond the panel.
    `--orb-whisper:${unit(orb.size.whisperPx)}`,
    `--orb-rim:${unit(orb.rim.widthPx)}`,
    `--orb-highlight:${unit(orb.highlight.widthPx)}`,
    // The Ovi conversation panel (D3.2): fixed width, viewport-capped height.
    `--ovi-panel-width:${unit(layout.oviPanel.widthPx)}`,
    `--ovi-panel-max-height:${layout.oviPanel.maxHeightVh}vh`,
    // The quiz's thin warm progress line (D-QUIZ).
    `--quiz-progress:${unit(layout.quizProgress.heightPx)}`,
  ];

  // Motion vars consumed by the CSS View Transitions in globals.css (CSS can't
  // import the TS tokens, so the page-transition timing is surfaced here). The
  // page-rise offset is `motion.pageRise.yPx`; the ease is the token bezier;
  // the duration is the token max ceiling (350ms → we cap the VT slightly under).
  const motionVars = [
    `--motion-page-rise:${unit(motion.pageRise.yPx)}`,
    `--motion-ease:${motion.easing.css}`,
    `--motion-page-ms:${motion.durations.maxMs}ms`,
    `--motion-reduced-ms:${motion.durations.reducedFadeMs}ms`,
  ];

  return [
    ...semantic,
    ...radiiVars,
    ...spacingVars,
    ...dimensionVars,
    ...motionVars,
  ].join(';');
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
  // The rail is the web app's ONLY nav, at every width (user decree 2026-07-19:
  // no floating tab bar on the website — the pill is a native-app gesture).
  `.era-rail{display:flex}`,
  `.era-tabs-shell{padding-bottom:var(--space-8);padding-left:var(--rail-width)}`,
].join('\n');

/**
 * Inline IIFE for the <head>: resolves the stored preference (or system) and
 * sets `data-theme` before first paint so there is no light/dark flash.
 */
export const noFlashScript = `(function(){try{var s=localStorage.getItem('era-theme');var m=s||'system';var r=m==='system'?(window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'):m;document.documentElement.dataset.theme=r;}catch(e){document.documentElement.dataset.theme='light';}})();`;
