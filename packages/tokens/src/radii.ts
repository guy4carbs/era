/**
 * radii — corner radii, scaled by surface size.
 *
 * iOS renders these as continuous (squircle) curves per Apple HIG; in React
 * Native pair each radius with `borderCurve: 'continuous'`. The web has no
 * squircle primitive, so it approximates with a plain `border-radius` of the
 * same value.
 */

export const radii = {
  chip: 8,
  input: 12,
  card: 16,
  sheet: 20,
  hero: 24,
  // full — orbs and pills (§3: "full on orb/pills"). 9999 saturates any box.
  full: 9999,
} as const;
