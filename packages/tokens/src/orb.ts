/**
 * orb — Ovi's living presence (a character, not a button).
 *
 * The dimensional sphere that replaces the flat accent circle everywhere Ovi
 * appears: a radial warm-cream core (surface → bg) inside a 1px taupe rim,
 * lit by a 1px highlight arc up top, carrying the §3 accent glow.
 *
 * Three states, springs only:
 *   IDLE     — breathing: scale 1.0 ↔ 1.0 + breath.scaleAmount plus the glow
 *              opacity pulse, on the glow.pulse 3s loop.
 *   THINKING — the glow shimmers in a slow rotation (shimmer.rotateMs) while
 *              the breath quickens to breath.thinkingMs.
 *   SPEAKING — a gentle pulse on the speaking cadence while the reply's text
 *              is landing.
 *
 * Hover/press leans the orb lean.px toward the pointer on the fluid spring.
 * Reduced motion: a static orb with the glow held at base opacity — no
 * breath, no shimmer, no pulse, no lean.
 *
 * The ambient loop durations here are exempt from motion.durations.maxMs the
 * same way glow.pulse is: that ceiling governs transitions, not idle
 * atmosphere.
 */

export const orb = {
  // The three canonical sizes. cornerPx replaces the old 48px text FAB and
  // stays >= the 44px minimum touch target; headerPx sits in page headers;
  // panelPx is the hero presence inside the Ovi panel.
  size: {
    cornerPx: 44,
    headerPx: 28,
    panelPx: 64,
  },
  // The 1px taupe rim and the 1px highlight arc that make it read dimensional.
  rim: {
    widthPx: 1,
  },
  highlight: {
    widthPx: 1,
    opacity: 0.55, // the white arc over the core — present, never shiny
  },
  breath: {
    scaleAmount: 0.03, // IDLE scale 1.0 <-> 1.03
    idleMs: 3000, // matches glow.pulse.durationMs — one shared heartbeat
    thinkingMs: 2200, // slightly quicker while THINKING
  },
  shimmer: {
    rotateMs: 6000, // THINKING: one slow revolution of the glow shimmer
  },
  speaking: {
    scaleAmount: 0.04, // a touch more than the breath — it is talking
    pulseMs: 900, // gentle cadence while reply text lands
  },
  lean: {
    px: 2, // hover/press lean toward the pointer (fluid spring)
  },
} as const;
