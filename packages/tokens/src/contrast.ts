/**
 * contrast — WCAG contrast math and the audited color-pair gate.
 *
 * `relativeLuminance` and `contrastRatio` are pure WCAG 2.x. `contrastPairs`
 * declares every foreground/background combination the design relies on, in
 * BOTH modes, each tagged with the usage it must satisfy:
 *   - 'body'  => normal text, requires 4.5:1
 *   - 'large' => >=17pt (or >=14pt bold) text, requires 3:1
 *   - 'ui'    => non-text UI / graphical objects, requires 3:1
 *
 * `runContrastAudit()` measures each pair; EVERY declared pair must pass at its
 * declared usage. This is the CI-enforceable contrast gate. If a pair fails,
 * the declaration is wrong per spec intent — fix the classification, not the
 * math (e.g. `secondary` is large-only at ~3.4:1; `secondaryStrong` is the
 * small-text-safe token).
 *
 * NOTE on accent: in light mode the accent (#A89B86) is decorative (glow,
 * sheen, hairlines) and does NOT clear 3:1 on bg, so it is intentionally NOT
 * declared as a light-mode UI pair. In dark mode the accent (#C9BEA9) is used
 * as a foreground hint and IS gated at 3:1.
 */

import { palette, type ThemeMode } from './colors.ts';

export type ContrastUsage = 'body' | 'large' | 'ui';

export interface ContrastPair {
  id: string;
  mode: ThemeMode;
  fgKey: string;
  fg: string;
  bgKey: string;
  bg: string;
  usage: ContrastUsage;
  required: number;
}

export interface ContrastAuditRow extends ContrastPair {
  /** Measured ratio, rounded to 2 decimal places. */
  ratio: number;
  pass: boolean;
}

function channel(value: number): number {
  const srgb = value / 255;
  return srgb <= 0.03928 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4;
}

/** WCAG relative luminance of a `#rrggbb` hex color, in [0, 1]. */
export function relativeLuminance(hex: string): number {
  const h = hex.replace('#', '');
  const r = Number.parseInt(h.slice(0, 2), 16);
  const g = Number.parseInt(h.slice(2, 4), 16);
  const b = Number.parseInt(h.slice(4, 6), 16);
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** WCAG contrast ratio between two `#rrggbb` hex colors, in [1, 21]. */
export function contrastRatio(hexA: string, hexB: string): number {
  const lumA = relativeLuminance(hexA);
  const lumB = relativeLuminance(hexB);
  const lighter = Math.max(lumA, lumB);
  const darker = Math.min(lumA, lumB);
  return (lighter + 0.05) / (darker + 0.05);
}

const light = palette.light;
const dark = palette.dark;

export const contrastPairs = [
  // --- light mode ---
  { id: 'light-text-bg', mode: 'light', fgKey: 'text', fg: light.text, bgKey: 'bg', bg: light.bg, usage: 'body', required: 4.5 },
  { id: 'light-text-surface', mode: 'light', fgKey: 'text', fg: light.text, bgKey: 'surface', bg: light.surface, usage: 'body', required: 4.5 },
  { id: 'light-secondary-bg', mode: 'light', fgKey: 'secondary', fg: light.secondary, bgKey: 'bg', bg: light.bg, usage: 'large', required: 3 },
  { id: 'light-secondary-surface', mode: 'light', fgKey: 'secondary', fg: light.secondary, bgKey: 'surface', bg: light.surface, usage: 'large', required: 3 },
  { id: 'light-secondaryStrong-bg', mode: 'light', fgKey: 'secondaryStrong', fg: light.secondaryStrong, bgKey: 'bg', bg: light.bg, usage: 'body', required: 4.5 },
  { id: 'light-secondaryStrong-surface', mode: 'light', fgKey: 'secondaryStrong', fg: light.secondaryStrong, bgKey: 'surface', bg: light.surface, usage: 'body', required: 4.5 },
  { id: 'light-sage-bg', mode: 'light', fgKey: 'semantic.sage', fg: palette.semantic.sage, bgKey: 'bg', bg: light.bg, usage: 'ui', required: 3 },
  { id: 'light-rust-bg', mode: 'light', fgKey: 'semantic.rust', fg: palette.semantic.rust, bgKey: 'bg', bg: light.bg, usage: 'ui', required: 3 },
  // --- dark mode ---
  { id: 'dark-text-bg', mode: 'dark', fgKey: 'text', fg: dark.text, bgKey: 'bg', bg: dark.bg, usage: 'body', required: 4.5 },
  { id: 'dark-text-surface', mode: 'dark', fgKey: 'text', fg: dark.text, bgKey: 'surface', bg: dark.surface, usage: 'body', required: 4.5 },
  { id: 'dark-secondary-bg', mode: 'dark', fgKey: 'secondary', fg: dark.secondary, bgKey: 'bg', bg: dark.bg, usage: 'large', required: 3 },
  { id: 'dark-secondary-surface', mode: 'dark', fgKey: 'secondary', fg: dark.secondary, bgKey: 'surface', bg: dark.surface, usage: 'large', required: 3 },
  { id: 'dark-secondaryStrong-bg', mode: 'dark', fgKey: 'secondaryStrong', fg: dark.secondaryStrong, bgKey: 'bg', bg: dark.bg, usage: 'body', required: 4.5 },
  { id: 'dark-secondaryStrong-surface', mode: 'dark', fgKey: 'secondaryStrong', fg: dark.secondaryStrong, bgKey: 'surface', bg: dark.surface, usage: 'body', required: 4.5 },
  // accent is a foreground hint in dark mode only (see file header note).
  { id: 'dark-accent-bg', mode: 'dark', fgKey: 'accent', fg: dark.accent, bgKey: 'bg', bg: dark.bg, usage: 'ui', required: 3 },
] as const satisfies readonly ContrastPair[];

/** Measure every declared pair. `pass` is true iff ratio >= required. */
export function runContrastAudit(): ContrastAuditRow[] {
  return contrastPairs.map((pair) => {
    const ratio = Math.round(contrastRatio(pair.fg, pair.bg) * 100) / 100;
    return { ...pair, ratio, pass: ratio >= pair.required };
  });
}
