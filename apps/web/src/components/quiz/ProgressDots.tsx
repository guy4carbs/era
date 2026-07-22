'use client';

import { type CSSProperties } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { motion as motionToken } from '@era/tokens';
import { strings } from '@era/core/strings';
import { transitionFor } from '../../lib/motion';

export interface ProgressDotsProps {
  /** Zero-based index of the current step. */
  current: number;
  /** Total number of steps. */
  total: number;
}

/** The hairline track the accent fill rides over. Height is the frozen token. */
const trackStyle: CSSProperties = {
  position: 'relative',
  width: '100%',
  height: 'var(--quiz-progress)',
  borderRadius: 'var(--radius-chip)',
  background: 'var(--color-hairline)',
  overflow: 'hidden',
};

const fillStyle: CSSProperties = {
  position: 'absolute',
  insetBlock: 0,
  insetInlineStart: 0,
  borderRadius: 'var(--radius-chip)',
  background: 'var(--color-accent)',
};

/**
 * The quiz's progress: a thin warm line, not dots. A hairline track carries an
 * accent fill whose width is (current + 1) / total, animated on the gentle
 * spring (a plain fade-to-width under reduced motion). No numbers or dots read
 * visually; the container still announces its position via `progressLabel` so
 * assistive tech gets the "Step N of total" it needs — the fill is decorative.
 */
export function ProgressDots({ current, total }: ProgressDotsProps) {
  const reduced = useReducedMotion();
  const fraction = total > 0 ? (current + 1) / total : 0;

  return (
    <div
      style={trackStyle}
      role="group"
      aria-label={strings.quiz.progressLabel(current + 1, total)}
    >
      <motion.span
        aria-hidden="true"
        style={fillStyle}
        initial={false}
        animate={{ width: `${fraction * 100}%` }}
        transition={transitionFor(motionToken.springs.gentle, reduced)}
      />
    </div>
  );
}
