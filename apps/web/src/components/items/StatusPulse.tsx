'use client';

import { type CSSProperties } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { motion as motionToken } from '@era/tokens';
import { Text } from '../Text';

export interface StatusPulseProps {
  /** The in-flight line to announce (e.g. "Uploading…"). */
  label: string;
}

const columnStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: 'var(--space-3)',
  paddingBlock: 'var(--space-16)',
  textAlign: 'center',
};


/**
 * A gentle breathing status line for the in-flight stages of the add flows
 * (upload → process, receipt parse, batch segmentation). Announced via
 * `aria-live="polite"`; under `prefers-reduced-motion` the breathing stops and
 * the line is simply held static. Shared across AddItemFlow, ReceiptImport, and
 * BulkCapture so every waiting beat reads identically.
 */
export function StatusPulse({ label }: StatusPulseProps) {
  const reduced = useReducedMotion();
  return (
    <div style={columnStyle} aria-live="polite">
      <motion.p
        style={{ margin: 0, color: 'var(--color-secondary-strong)' }}
        animate={reduced ? undefined : { opacity: [0.55, 1, 0.55] }}
        transition={reduced ? undefined : { duration: 1.4, repeat: Infinity, ease: motionToken.easing.bezier }}
      >
        <Text variant="body" as="span" style={{ color: 'inherit' }}>
          {label}
        </Text>
      </motion.p>
    </div>
  );
}
