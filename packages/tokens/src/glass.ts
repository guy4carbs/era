/**
 * glass — the frosted-surface recipe (nav bars, sheets, floating panels).
 *
 * A backdrop blur under a translucent mode tint, finished with a 1px border and
 * a hairline inner highlight along the top edge to catch light like real glass.
 */

export const glass = {
  blur: 20,
  tintOpacity: {
    light: 0.7,
    dark: 0.6,
  },
  borderWidth: 1,
  // innerHighlight — a 1px white top-edge sheen at 8% opacity.
  innerHighlight: {
    color: '#FFFFFF',
    opacity: 0.08,
    height: 1,
  },
  // innerHighlightColor — the innerHighlight pre-composed as a ready-to-use rgba
  // string (color at its opacity), for consumers that need a single colour value
  // (CSS box-shadow, RN gradient stop). Derived from innerHighlight above.
  innerHighlightColor: 'rgba(255, 255, 255, 0.08)',
} as const;
