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
} as const;
