/**
 * elevation — warm-ink shadows, per mode.
 *
 * Light-mode shadows use `palette.ink` (rgb(28, 27, 25)), never pure black, so
 * lifted surfaces cast a warm shadow. Four levels:
 *   e1 — resting hairline lift (chips, list rows)
 *   e2 — raised (cards, popovers)
 *   e3 — floating; a dual shadow (soft ambient + tight key) for sheets/menus
 *   e4 — modal / hero overlay
 *
 * DARK mode (§3): same geometry, opacity +0.04 (e1/e2) and +0.06 (e3, both
 * layers) so depth still reads against a dark bg — except e4, which switches to
 * TRUE BLACK at 0.45 (`0 16px 48px rgba(0,0,0,0.45)`): a modal over a dark
 * scene needs real darkness, not warm ink, to separate.
 *
 * `elevation` / `boxShadows` are the LIGHT recipes (and the back-compat
 * default); `elevationDark` / `boxShadowsDark` are the dark ones. On web,
 * prefer the themed `var(--shadow-e*)` custom properties (theme-css emits both
 * modes) over these strings. `rnShadow(level, mode)` returns React Native
 * shadow props for a mode; RN supports a single shadow layer, so for e3 it uses
 * the ambient layer plus an Android `elevation` (dp) approximation.
 */

import { palette } from './colors.ts';
import type { ThemeMode } from './colors.ts';

export const elevation = {
  e1: { y: 1, blur: 2, opacity: 0.06 },
  e2: { y: 2, blur: 8, opacity: 0.08 },
  e3: {
    ambient: { y: 8, blur: 24, opacity: 0.1 },
    key: { y: 2, blur: 6, opacity: 0.12 },
  },
  e4: { y: 16, blur: 48, opacity: 0.18 },
} as const;

// Dark variants — light values +0.04 (e1/e2) / +0.06 (e3); e4 = black 0.45.
export const elevationDark = {
  e1: { y: 1, blur: 2, opacity: 0.1 },
  e2: { y: 2, blur: 8, opacity: 0.12 },
  e3: {
    ambient: { y: 8, blur: 24, opacity: 0.16 },
    key: { y: 2, blur: 6, opacity: 0.18 },
  },
  e4: { y: 16, blur: 48, opacity: 0.45 },
} as const;

export type ElevationLevel = keyof typeof elevation;

// Prebuilt CSS box-shadow strings — LIGHT. ink = rgb(28, 27, 25) (palette.ink).
export const boxShadows = {
  e1: '0 1px 2px rgba(28, 27, 25, 0.06)',
  e2: '0 2px 8px rgba(28, 27, 25, 0.08)',
  // e3 — ambient (soft, spread) then key (tight, darker), comma-joined.
  e3: '0 8px 24px rgba(28, 27, 25, 0.1), 0 2px 6px rgba(28, 27, 25, 0.12)',
  e4: '0 16px 48px rgba(28, 27, 25, 0.18)',
} as const;

// Prebuilt CSS box-shadow strings — DARK. e1–e3 stay warm ink; e4 is true black.
export const boxShadowsDark = {
  e1: '0 1px 2px rgba(28, 27, 25, 0.1)',
  e2: '0 2px 8px rgba(28, 27, 25, 0.12)',
  e3: '0 8px 24px rgba(28, 27, 25, 0.16), 0 2px 6px rgba(28, 27, 25, 0.18)',
  e4: '0 16px 48px rgba(0, 0, 0, 0.45)',
} as const;

export interface RnShadow {
  shadowColor: string;
  shadowOffset: { width: number; height: number };
  shadowRadius: number;
  shadowOpacity: number;
  /** Android elevation in dp (single number; approximates the iOS shadow). */
  elevation: number;
}

// Android elevation (dp) per level — a coarse mapping of the shadow depth.
const androidElevation = { e1: 1, e2: 4, e3: 8, e4: 16 } as const;

/**
 * React Native shadow props for a level and mode. For e3 (a dual shadow) the
 * ambient layer is used, since RN renders only one shadow. Mode defaults to
 * 'light' so existing callers keep their exact behavior; themed surfaces pass
 * `resolved` from useTheme(). Dark e4 casts TRUE BLACK per the spec.
 */
export function rnShadow(level: ElevationLevel, mode: ThemeMode = 'light'): RnShadow {
  const set = mode === 'dark' ? elevationDark : elevation;
  const layer = level === 'e3' ? set.e3.ambient : set[level];
  return {
    shadowColor: mode === 'dark' && level === 'e4' ? '#000000' : palette.ink,
    shadowOffset: { width: 0, height: layer.y },
    shadowRadius: layer.blur,
    shadowOpacity: layer.opacity,
    elevation: androidElevation[level],
  };
}
