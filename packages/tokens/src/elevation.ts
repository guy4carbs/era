/**
 * elevation — warm-ink shadows.
 *
 * All shadows use `palette.ink` (rgb(28, 27, 25)), never pure black, so lifted
 * surfaces cast a warm shadow. Four levels:
 *   e1 — resting hairline lift (chips, list rows)
 *   e2 — raised (cards, popovers)
 *   e3 — floating; a dual shadow (soft ambient + tight key) for sheets/menus
 *   e4 — modal / hero overlay
 *
 * `elevation` holds the raw numbers. `boxShadows` are prebuilt CSS strings
 * (e3 is the comma-joined ambient + key pair). `rnShadow(level)` returns React
 * Native shadow props; RN supports a single shadow layer, so for e3 it uses the
 * ambient layer plus an Android `elevation` (dp) approximation.
 */

import { palette } from './colors.ts';

export const elevation = {
  e1: { y: 1, blur: 2, opacity: 0.06 },
  e2: { y: 2, blur: 8, opacity: 0.08 },
  e3: {
    ambient: { y: 8, blur: 24, opacity: 0.1 },
    key: { y: 2, blur: 6, opacity: 0.12 },
  },
  e4: { y: 16, blur: 48, opacity: 0.18 },
} as const;

export type ElevationLevel = keyof typeof elevation;

// Prebuilt CSS box-shadow strings. ink = rgb(28, 27, 25) (palette.ink).
export const boxShadows = {
  e1: '0 1px 2px rgba(28, 27, 25, 0.06)',
  e2: '0 2px 8px rgba(28, 27, 25, 0.08)',
  // e3 — ambient (soft, spread) then key (tight, darker), comma-joined.
  e3: '0 8px 24px rgba(28, 27, 25, 0.1), 0 2px 6px rgba(28, 27, 25, 0.12)',
  e4: '0 16px 48px rgba(28, 27, 25, 0.18)',
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
 * React Native shadow props for a level. For e3 (a dual shadow) the ambient
 * layer is used, since RN renders only one shadow.
 */
export function rnShadow(level: ElevationLevel): RnShadow {
  const layer = level === 'e3' ? elevation.e3.ambient : elevation[level];
  return {
    shadowColor: palette.ink,
    shadowOffset: { width: 0, height: layer.y },
    shadowRadius: layer.blur,
    shadowOpacity: layer.opacity,
    elevation: androidElevation[level],
  };
}
