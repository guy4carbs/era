'use client';

import { type CSSProperties } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { glow, motion as motionToken } from '@era/tokens';
import { strings } from '@era/core/strings';
import { useTheme } from '../lib/theme';
import { glowShadow } from '../lib/glow';
import { Text } from './Text';

export interface OviFabProps {
  onClick?: () => void;
  style?: CSSProperties;
}

const fabStyle: CSSProperties = {
  position: 'fixed',
  right: 'var(--space-4)',
  // No tab bar on web (the rail is the nav) — the FAB hugs the corner.
  bottom: 'calc(var(--space-4) + env(safe-area-inset-bottom))',
  width: 'var(--touch-target-web)',
  height: 'var(--touch-target-web)',
  minWidth: 'var(--touch-target-min)',
  minHeight: 'var(--touch-target-min)',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  borderRadius: 'var(--radius-full)',
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
        ease: motionToken.easing.bezier,
      };

  return (
    <motion.button
      type="button"
      aria-label={strings.ovi.fabLabel}
      style={{ ...fabStyle, boxShadow: restShadow, ...style }}
      animate={animate}
      transition={transition}
      whileTap={reduced ? undefined : { scale: motionToken.press.scale }}
      onClick={onClick}
    >
      <Text variant="ui" aria-hidden="true">Ovi</Text>
    </motion.button>
  );
}
