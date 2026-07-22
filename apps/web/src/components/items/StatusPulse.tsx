'use client';

import { type CSSProperties } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { motion as motionToken } from '@era/tokens';
import { OviOrb } from '../ovi/OviOrb';
import { Text } from '../Text';

export interface StatusPulseProps {
  /** The in-flight line to announce (e.g. "Uploading…"). */
  label: string;
}

const columnStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: 'var(--space-4)',
  paddingBlock: 'var(--space-16)',
  textAlign: 'center',
};


/**
 * The in-flight status beat for the add flows (upload → process, receipt parse,
 * batch segmentation). Already a designed, breathing waiting state — D-WAIT keeps
 * it, but upgrades it to carry Ovi's presence: the whisper orb breathes above a
 * breathing caption, so the wait reads as Ovi working, not as chrome.
 *
 * The caption keeps its opacity breath (a designed pulse, not a spinner) and the
 * whole thing is announced via `aria-live="polite"`. Under
 * `prefers-reduced-motion` both the orb and the caption hold static — the orb
 * (via OviOrb) and the caption (guarded here) — and the line is simply held.
 * Shared across AddItemFlow, ReceiptImport, and BulkCapture so every waiting beat
 * reads identically.
 */
export function StatusPulse({ label }: StatusPulseProps) {
  const reduced = useReducedMotion();
  return (
    <div style={columnStyle} aria-live="polite">
      {/* The orb rides its own IDLE breath (static under reduced motion); it is
          aria-hidden inside OviOrb, so the live caption below owns the wording. */}
      <OviOrb size={{ cssVar: 'var(--orb-whisper)' }} state="idle" />
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
