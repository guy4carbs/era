'use client';

import { type CSSProperties } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { motion as motionToken, glow } from '@era/tokens';
import { useTheme } from '../../lib/theme';

/**
 * The hero's accent glow bloom: a soft radial halo behind the headline. Its
 * strength is the per-mode `glow.opacity` (dark carries a stronger base so it
 * reads on the deeper surface). Idle, it breathes — a 3s scale/opacity pulse of
 * `glow.pulse.amount` — matching the token's documented behaviour. Under reduced
 * motion the pulse is OFF and the bloom holds at its base opacity.
 */
export function HeroGlow() {
  const reduced = useReducedMotion();
  const { resolved } = useTheme();

  // Base halo strength as a color-mix percentage (per-mode glow opacity).
  const basePct = Math.round(glow.opacity[resolved] * 100);

  const bloomStyle: CSSProperties = {
    position: 'absolute',
    inset: 0,
    zIndex: 0,
    pointerEvents: 'none',
    background: `radial-gradient(60% 55% at 50% 42%, color-mix(in srgb, var(--color-accent) ${basePct}%, transparent), transparent 72%)`,
  };

  if (reduced) {
    return <div aria-hidden="true" style={bloomStyle} />;
  }

  const low = 1 - glow.pulse.amount;
  const high = 1 + glow.pulse.amount;

  return (
    <motion.div
      aria-hidden="true"
      style={bloomStyle}
      initial={{ opacity: low, scale: 1 }}
      animate={{ opacity: [low, 1, low], scale: [1, high, 1] }}
      transition={{
        duration: glow.pulse.durationMs / 1000,
        repeat: Infinity,
        ease: motionToken.easing.bezier,
      }}
    />
  );
}
