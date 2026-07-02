/**
 * colors — the Era palette.
 *
 * Warm cream/black base. Light and dark are true peers (not inverted): each
 * mode declares its own bg/surface/text/accent so contrast holds both ways.
 * Every value below is a literal from the design spec; the contrast module
 * (`./contrast.ts`) audits these against WCAG and is the CI gate.
 */

export type ThemeMode = 'light' | 'dark';

export const palette = {
  light: {
    bg: '#FAF7F0',
    surface: '#F5F1E8',
    text: '#1C1B19',
    // secondary — LEGAL / disclosure text ONLY, and only at >=17pt. It clears
    // WCAG large-text 3:1 on bg (~3.4:1) but NOT body 4.5:1. Never use for
    // small copy; reach for `secondaryStrong` there.
    secondary: '#8A857C',
    // secondaryStrong — small-text-safe secondary. Clears body 4.5:1 on bg.
    secondaryStrong: '#6E695F',
    // accent — warm taupe. Decorative in light mode (glow, sheen, hairlines,
    // fills): it does NOT clear 3:1 on bg, so never use it as a foreground that
    // must carry contrast in light mode. See contrast.ts for why it is gated in
    // dark mode only.
    accent: '#A89B86',
    hairline: '#E2DACB',
  },
  dark: {
    bg: '#1C1B19',
    surface: '#26241F',
    text: '#F5F1E8',
    secondary: '#A89B86',
    secondaryStrong: '#B5AC9C',
    accent: '#C9BEA9',
    hairline: '#3A3833',
  },
  // semantic — mode-independent status hues, tuned to clear 3:1 on the light bg.
  semantic: {
    sage: '#5A6650',
    rust: '#9C5A3C',
  },
  // ink — the shadow color. Warm near-black, never pure #000000, so elevation
  // reads as a soft warm shadow rather than a cold gray. rgb(28, 27, 25).
  ink: '#1C1B19',
  white: '#FFFFFF',
} as const;
