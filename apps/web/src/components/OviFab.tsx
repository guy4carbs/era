'use client';

import { type CSSProperties } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { glow } from '@era/tokens';
import { strings } from '@era/core/strings';
import { useTheme } from '../lib/theme';
import { Text } from './Text';

export interface OviFabProps {
  onClick?: () => void;
  style?: CSSProperties;
}

/** Accent glow shadow at a given opacity, layered above the e3 lift. */
function glowShadow(opacity: number): string {
  const clamped = Math.min(1, Math.max(0, opacity));
  return `var(--shadow-e3), 0 0 var(--glow-blur) color-mix(in srgb, var(--color-accent) ${Math.round(
    clamped * 100,
  )}%, transparent)`;
}

const fabStyle: CSSProperties = {
  position: 'fixed',
  right: 'var(--space-4)',
  bottom: 'calc(var(--tabbar-height) + var(--space-4) + env(safe-area-inset-bottom))',
  width: 'var(--touch-target-web)',
  height: 'var(--touch-target-web)',
  minWidth: 'var(--touch-target-min)',
  minHeight: 'var(--touch-target-min)',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  borderRadius: '50%',
  border: 'none',
  cursor: 'pointer',
  background: 'var(--color-accent)',
  color: 'var(--color-ink)',
  zIndex: 60,
};

/**
 * Ovi's floating summon button. Idle-pulses its glow and scale on a slow loop;
 * under reduced motion it holds a static glow and never pulses.
 */
export function OviFab({ onClick, style }: OviFabProps) {
  const reduced = useReducedMotion();
  const { resolved } = useTheme();

  const baseOpacity = glow.opacity[resolved];
  const restShadow = glowShadow(baseOpacity);
  const peakShadow = glowShadow(baseOpacity + glow.pulse.amount);

  const animate = reduced
    ? { boxShadow: restShadow }
    : {
        scale: [1, 1 + glow.pulse.amount, 1],
        boxShadow: [restShadow, peakShadow, restShadow],
      };

  const transition = reduced
    ? undefined
    : {
        duration: glow.pulse.durationMs / 1000,
        repeat: Infinity,
        ease: 'easeInOut' as const,
      };

  return (
    <motion.button
      type="button"
      aria-label={strings.ovi.fabLabel}
      style={{ ...fabStyle, boxShadow: restShadow, ...style }}
      animate={animate}
      transition={transition}
      whileTap={reduced ? undefined : { scale: 0.94 }}
      onClick={onClick}
    >
      <Text variant="ui" aria-hidden="true">Ovi</Text>
    </motion.button>
  );
}
