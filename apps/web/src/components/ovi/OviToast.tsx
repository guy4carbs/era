'use client';

import { type CSSProperties } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { motion as motionToken, boxShadows } from '@era/tokens';
import { transitionFor } from '../../lib/motion';
import { Text } from '../Text';

export interface OviToastProps {
  /** The message to announce, or null to render nothing. */
  message: string | null;
}

const toastStyle: CSSProperties = {
  position: 'fixed',
  left: '50%',
  bottom: 'calc(var(--space-16) + env(safe-area-inset-bottom))',
  paddingInline: 'var(--space-4)',
  paddingBlock: 'var(--space-3)',
  borderRadius: 'var(--radius-input)',
  background: 'var(--color-surface)',
  border: '1px solid var(--color-hairline)',
  color: 'var(--color-text)',
  boxShadow: boxShadows.e3,
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
