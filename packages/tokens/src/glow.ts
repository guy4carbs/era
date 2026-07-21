/**
 * glow — the accent-colored outer glow (focus, selection, hero emphasis).
 *
 * An accent-hued soft halo. When idle it breathes: a pulse that scales the glow
 * +/-10% (`pulse.amount`) on a 3s loop. Dark mode carries a stronger base glow
 * so it reads against the deeper surface. Reduced motion turns the pulse OFF
 * (see `motion.ts`) and holds the glow at its base opacity.
 */

export const glow = {
  blurRadius: 24,
  opacity: {
    light: 0.28,
    dark: 0.4,
  },
  pulse: {
    amount: 0.1, // +/-10% around the base opacity
    durationMs: 3000, // 3s idle loop
  },
  // caretDimOpacity — the low point of Ovi's streaming-caret blink (D3.2): the
  // accent caret pulses full → this → full on the `stream.wordMs` cadence, so the
  // insertion point breathes while words land. Shared by web and mobile.
  caretDimOpacity: 0.3,
} as const;
