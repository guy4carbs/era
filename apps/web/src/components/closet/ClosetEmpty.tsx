'use client';

import { type CSSProperties } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { glow, motion as motionToken } from '@era/tokens';
import { strings } from '@era/core/strings';
import { useTheme } from '../../lib/theme';
import { glowShadow } from '../../lib/glow';
import { Button } from '../Button';
import { Text } from '../Text';

export interface ClosetEmptyProps {
  /** Start the add flow. */
  onAddPhoto: () => void;
}

/**
 * The empty closet — signature decision #13. Ovi's small orb breathes above ONE
 * Fraunces line ({@link strings.closet.emptySignature}) and a single primary
 * action into the add flow. An invitation, not an instruction: the old title +
 * body copy and the second import button are gone — absence over noise.
 */
export function ClosetEmpty({ onAddPhoto }: ClosetEmptyProps) {
  const reduced = useReducedMotion();
  const { resolved } = useTheme();

  // The orb carries the same accent glow recipe as the rail/FAB, breathing on
  // the 3s pulse loop; reduced motion holds it at the mode's base glow opacity.
  const baseOpacity = glow.opacity[resolved];
  const restShadow = glowShadow(baseOpacity);
  const peakShadow = glowShadow(baseOpacity + glow.pulse.amount);
  const orbAnimate = reduced
    ? { boxShadow: restShadow }
    : {
        scale: [1, 1 + glow.pulse.amount, 1],
        boxShadow: [restShadow, peakShadow, restShadow],
      };
  const orbTransition = reduced
    ? undefined
    : {
        duration: glow.pulse.durationMs / 1000,
        repeat: Infinity,
        ease: motionToken.easing.bezier,
      };

  return (
    <div style={columnStyle}>
      <motion.span
        aria-hidden="true"
        style={{ ...orbStyle, boxShadow: restShadow }}
        animate={orbAnimate}
        transition={orbTransition}
      />
      <Text variant="largeTitle" as="h1" style={{ margin: 0 }}>
        {strings.closet.emptySignature}
      </Text>
      <div style={actionStyle}>
        <Button variant="primary" onClick={onAddPhoto}>
          {strings.closet.addCta}
        </Button>
      </div>
    </div>
  );
}

const columnStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'flex-start',
  gap: 'var(--space-6)',
  paddingBlock: 'var(--space-16)',
  maxWidth: 'var(--feed-col)',
};

// Ovi's hero orb — a step up from the rail orb (12px) to --space-6 (24px) for
// this signature moment; the accent circle carries the shared glow recipe.
const orbStyle: CSSProperties = {
  width: 'var(--space-6)',
  height: 'var(--space-6)',
  borderRadius: 'var(--radius-full)',
  background: 'var(--color-accent)',
  flex: 'none',
};

const actionStyle: CSSProperties = {
  display: 'flex',
};
