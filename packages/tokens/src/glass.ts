/**
 * glass — the frosted-surface recipe (nav bars, sheets, floating panels).
 *
 * A backdrop blur under a translucent mode tint, finished with a 1px border and
 * a hairline inner highlight along the top edge to catch light like real glass.
 * Numbers are the §3 spec exactly: light `rgba(250,247,240,0.72)` tint with a
 * bright 55% top highlight; dark `rgba(28,27,25,0.62)` with a faint 6% one.
 */

export const glass = {
  blur: 20,
  tintOpacity: {
    light: 0.72,
    dark: 0.62,
  },
  borderWidth: 1,
  // border — the 1px frame, per mode: warm ink at 8% on light, warm cream at 8%
  // on dark (§3: rgba(28,27,25,0.08) / rgba(245,241,232,0.08)).
  border: {
    light: 'rgba(28, 27, 25, 0.08)',
    dark: 'rgba(245, 241, 232, 0.08)',
  },
  // innerHighlight — a 1px white top-edge catch-light. Bright on light glass
  // (0.55), barely-there on dark (0.06) where a bright line would glow.
  innerHighlight: {
    color: '#FFFFFF',
    opacity: {
      light: 0.55,
      dark: 0.06,
    },
    height: 1,
  },
  // innerHighlightColor — the highlight pre-composed as ready-to-use rgba
  // strings (color at its per-mode opacity), for consumers that need a single
  // colour value (CSS box-shadow, RN gradient stop).
  innerHighlightColor: {
    light: 'rgba(255, 255, 255, 0.55)',
    dark: 'rgba(255, 255, 255, 0.06)',
  },
} as const;
