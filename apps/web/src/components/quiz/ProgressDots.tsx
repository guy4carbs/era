'use client';

import { type CSSProperties } from 'react';
import { strings } from '@era/core/strings';

export interface ProgressDotsProps {
  /** Zero-based index of the current step. */
  current: number;
  /** Total number of steps. */
  total: number;
}

const rowStyle: CSSProperties = {
  display: 'flex',
  gap: 'var(--space-2)',
  alignItems: 'center',
  justifyContent: 'center',
};

const dotBase: CSSProperties = {
  width: 'var(--space-2)',
  height: 'var(--space-2)',
  borderRadius: 'var(--radius-chip)',
};

/**
 * A row of `total` dots. Every step up to and including the current one reads in
 * the accent; upcoming steps sit in the hairline. The row announces its position
 * with the shared `progressLabel` copy; the dots themselves are decorative.
 */
export function ProgressDots({ current, total }: ProgressDotsProps) {
  return (
    <div
      style={rowStyle}
      role="group"
      aria-label={strings.quiz.progressLabel(current + 1, total)}
    >
      {Array.from({ length: total }, (_, i) => (
        <span
          key={i}
          aria-hidden="true"
          style={{
            ...dotBase,
            background: i <= current ? 'var(--color-accent)' : 'var(--color-hairline)',
          }}
        />
      ))}
    </div>
  );
}
