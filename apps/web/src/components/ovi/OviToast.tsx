'use client';

import { type CSSProperties } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { motion as motionToken } from '@era/tokens';
import { transitionFor } from '../../lib/motion';
import { glassSurfaceStyle } from '../GlassPanel';
import { Text } from '../Text';

export interface OviToastProps {
  /** The message to announce, or null to render nothing. */
  message: string | null;
}

// A toast floats over arbitrary content (whatever surface is underneath), so it
// takes the glass recipe with `busy` — the AA-guaranteed scrim keeps its text
// legible over any backdrop — at e3 elevation and the input radius.
const toastStyle: CSSProperties = {
  ...glassSurfaceStyle({ busy: true, shadow: 'e3', radius: 'var(--radius-input)' }),
  position: 'fixed',
  left: '50%',
  bottom: 'calc(var(--space-16) + env(safe-area-inset-bottom))',
  paddingInline: 'var(--space-4)',
  paddingBlock: 'var(--space-3)',
  color: 'var(--color-text)',
  zIndex: 70,
};

/**
 * The small centred confirmation toast Ovi's surfaces share (accept/reject).
 * Springs up gently, holds, and fades — reduced-motion safe. Wrap in an
 * `AnimatePresence` and drive with a timed `message` state, matching the toast
 * pattern used across the Design and Closet surfaces.
 */
export function OviToast({ message }: OviToastProps) {
  const reduced = useReducedMotion();
  if (!message) return null;

  return (
    <motion.div
      key={message}
      role="status"
      style={toastStyle}
      initial={{ opacity: 0, x: '-50%', y: reduced ? 0 : 8 }}
      animate={{ opacity: 1, x: '-50%', y: 0 }}
      exit={{ opacity: 0, x: '-50%', y: reduced ? 0 : 8 }}
      transition={transitionFor(motionToken.springs.gentle, reduced)}
    >
      <Text variant="caption" size="footnote" as="span">
        {message}
      </Text>
    </motion.div>
  );
}

/** How long a toast stays up before auto-dismissing — shared across surfaces. */
export const OVI_TOAST_MS = motionToken.durations.maxMs * 8;
