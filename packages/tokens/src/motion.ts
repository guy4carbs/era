/**
 * motion — springs, easing, durations, and tilt.
 *
 * Springs (stiffness/damping) drive most transitions:
 *   gentle — sheets, tabs, reveals (soft settle)
 *   snappy — buttons, chips, toggles (crisp, immediate)
 *   fluid  — feed swipe, canvas drag (tracks the finger, low friction)
 *
 * The `easing` bezier is the CSS fallback where springs are unavailable.
 * Nothing animates slower than 350ms (`durations.maxMs`).
 *
 * Reduced motion: replace every spring with a `reducedFadeMs` (150ms) opacity
 * fade, and turn the glow pulse and parallax/tilt OFF.
 */

export const motion = {
  springs: {
    gentle: { stiffness: 170, damping: 26 },
    snappy: { stiffness: 300, damping: 30 },
    fluid: { stiffness: 220, damping: 28 },
  },
  easing: {
    css: 'cubic-bezier(0.32, 0.72, 0, 1)',
    bezier: [0.32, 0.72, 0, 1],
  },
  durations: {
    minMs: 200,
    maxMs: 350, // hard ceiling — nothing slower than this
    reducedFadeMs: 150, // the fade springs collapse to under reduced motion
  },
  tilt: {
    maxDeg: 7, // max pointer-tilt rotation
    parallaxPx: 6, // max parallax offset; OFF under reduced motion
  },
} as const;
