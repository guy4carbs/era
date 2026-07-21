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
  // press — the universal tap affordance (§3: "scale 0.97 on press-in, spring
  // back; every tappable element — nothing is inert"). Snappy spring in, spring
  // back on release; a 150ms fade under reduced motion.
  press: {
    scale: 0.97,
  },
  // stagger — list/grid/chat entrance choreography (§3: "children delay 45ms;
  // y 12→0; opacity 0→1; blur 4→0"). Blur applies on web only — RN has no
  // performant view blur, so mobile entrances run rise+fade without it.
  // Under reduced motion: simultaneous 150ms fade, no rise, no blur.
  stagger: {
    delayMs: 45,
    riseYPx: 12,
    blurPx: 4,
    // bloomScale — the scale a surface blooms UP from when it grows from a point
    // (the Ovi panel/sheet blooming out of the corner FAB, the reveal stage's
    // gift lift): start at 0.96 and settle to 1 on the gentle spring, paired with
    // the `riseYPx` rise and an opacity fade. Shared by web and mobile so the
    // bloom-from-corner choreography reads identically on both.
    bloomScale: 0.96,
  },
  // pageRise — page/tab transition: content cross-fades with a small rise on
  // the gentle spring (View Transitions on web approximate with the css bezier).
  pageRise: {
    yPx: 6,
  },
  // headerRise — the page-header entrance (D6): the title rises 8px with a
  // fade, and the one-line subtitle follows on a 60ms delay. Reduced motion
  // collapses both to the standard fade, simultaneous.
  headerRise: {
    yPx: 8,
    subtitleDelayMs: 60,
  },
  // reveal — the Today's Look ritual (D9): cutouts assemble one by one on the
  // gentle spring, each shadow landing a beat after its piece; the whole
  // sequence must fit the 2.5s gift-budget and is skippable by tap. With the
  // stylist's 5-slot cap: 5 × 350 + 400 settle = 2150ms ≤ maxTotalMs (asserted
  // in tokens.test). Consumers must compress itemIntervalMs if a longer list
  // ever appears: interval = min(itemIntervalMs, (maxTotalMs - settleMs) / n).
  reveal: {
    itemIntervalMs: 350,
    shadowLagMs: 120,
    settleMs: 400,
    maxTotalMs: 2500,
  },
  // stream — Ovi's replies land word-by-word (D3.2: the API returns one blob;
  // the CLIENT streams it as an editorial typewriter with a soft cursor glow,
  // and the orb holds SPEAKING for exactly this reveal's duration). wordMs is
  // the per-word cadence; reduced motion shows the reply at once.
  stream: {
    wordMs: 45,
  },
} as const;
