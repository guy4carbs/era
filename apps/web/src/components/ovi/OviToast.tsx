'use client';

import { type CSSProperties } from 'react';
import { motion, useReducedMotion, type TargetAndTransition } from 'motion/react';
import { glow, motion as motionToken } from '@era/tokens';
import { transitionFor } from '../../lib/motion';
import { glowShadow } from '../../lib/glow';
import { useTheme } from '../../lib/theme';
import { glassSurfaceStyle } from '../GlassPanel';
import { Text } from '../Text';

/**
 * The toast's tone (D-WAIT). The brand keeps its voice when things fail — no red
 * banner, no exclamation:
 *   neutral — a quiet glass confirmation (the default accept/reject beat).
 *   error   — glass toast + a muted-rust HAIRLINE (a 1px left rule at reduced
 *             opacity). Calm Geist line; rust stays a quiet accent, never a fill.
 *   success — a quiet glass toast + a small accent glow bloom on entrance.
 */
export type OviToastVariant = 'neutral' | 'error' | 'success';

export interface OviToastProps {
  /** The message to announce, or null to render nothing. */
  message: string | null;
  /** Tone — drives the rust hairline (error) or the entrance glow bloom (success). */
  variant?: OviToastVariant;
}

// A toast floats over arbitrary content (whatever surface is underneath), so it
// takes the glass recipe with `busy` — the AA-guaranteed scrim keeps its text
// legible over any backdrop — at e3 elevation and the input radius.
const baseToastStyle: CSSProperties = {
  ...glassSurfaceStyle({ busy: true, shadow: 'e3', radius: 'var(--radius-input)' }),
  position: 'fixed',
  left: '50%',
  bottom: 'calc(var(--space-16) + env(safe-area-inset-bottom))',
  paddingInline: 'var(--space-4)',
  paddingBlock: 'var(--space-3)',
  color: 'var(--color-text)',
  zIndex: 70,
};

// The error hairline — a 1px left rule in muted rust. color-mix drops the rust to
// a quiet 55% so it reads as a calm accent stripe, never an alarm bar. Rust is a
// UI-contrast hue (3:1); as a 1px graphical rule (not text) it stays within that
// gate.
const errorHairline = '1px solid color-mix(in srgb, var(--color-rust) 55%, transparent)';

/**
 * The small centred toast Ovi's surfaces share (accept/reject, save, and the
 * calm failure line). Springs up gently, holds, and fades — reduced-motion safe.
 * Wrap in an `AnimatePresence` and drive with a timed `message` state, dismissing
 * after {@link TOAST_DISMISS_MS}.
 *
 * error carries a muted-rust left hairline; success blooms a small accent glow on
 * entrance (base → peak → settle) then holds. neutral is the plain glass toast.
 */
export function OviToast({ message, variant = 'neutral' }: OviToastProps) {
  const reduced = useReducedMotion();
  const { resolved } = useTheme();
  if (!message) return null;

  const isError = variant === 'error';
  const isSuccess = variant === 'success';

  // Success entrance glow: bloom the accent halo from base → peak → settle, then
  // hold at base. Reduced motion holds base with no bloom.
  const baseOpacity = glow.opacity[resolved];
  const restShadow = glowShadow(baseOpacity);
  const peakShadow = glowShadow(baseOpacity + glow.pulse.amount);

  const style: CSSProperties = {
    ...baseToastStyle,
    ...(isError ? { borderLeft: errorHairline } : {}),
  };

  // Compose the entrance: the shared gentle rise, plus (success only) the one-shot
  // glow bloom layered on the box shadow. The glass recipe already sets a
  // boxShadow, so success overrides it for the bloom keyframes and lands on
  // restShadow; neutral/error keep the recipe's shadow untouched.
  const animate: TargetAndTransition = { opacity: 1, x: '-50%', y: 0 };
  if (isSuccess && !reduced) {
    animate.boxShadow = [restShadow, peakShadow, restShadow];
  }

  return (
    <motion.div
      key={message}
      role="status"
      style={style}
      initial={{ opacity: 0, x: '-50%', y: reduced ? 0 : 8 }}
      animate={animate}
      exit={{ opacity: 0, x: '-50%', y: reduced ? 0 : 8 }}
      transition={
        isSuccess && !reduced
          ? {
              ...transitionFor(motionToken.springs.gentle, reduced),
              // The bloom rides a short one-shot, not the ambient loop.
              boxShadow: { duration: motionToken.durations.maxMs / 1000, ease: motionToken.easing.bezier },
            }
          : transitionFor(motionToken.springs.gentle, reduced)
      }
    >
      <Text variant="caption" size="footnote" as="span">
        {message}
      </Text>
    </motion.div>
  );
}

/**
 * How long a toast stays up before auto-dismissing — the frozen D-WAIT cadence
 * (motion.waiting.toastDismissMs, 2500ms). Shared across every surface so the
 * dwell time can never drift (this replaced the old maxMs×8 = 2800 math).
 */
export const TOAST_DISMISS_MS = motionToken.waiting.toastDismissMs;
