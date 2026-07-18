'use client';

import { type CSSProperties } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { motion as motionToken } from '@era/tokens';
import { transitionFor } from '../../../lib/motion';
import { Text, TextControlBoundary } from '../../../components';
import { QuizImage } from '../QuizImage';
import { SELECTION_RING, type QuizStep } from '../types';

export interface OccasionChipsProps {
  step: QuizStep;
  selectedIds: string[];
  onToggle: (optionId: string) => void;
}

/** Accent fill strength for a selected chip (fraction, not a dimension). */
const SELECTED_TINT = 0.16;

const chipStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 'var(--space-3)',
  minHeight: 'var(--touch-target-min)',
  padding: 'var(--space-2)',
  borderRadius: 'var(--radius-input)',
  cursor: 'pointer',
  textAlign: 'start',
};

const thumbStyle: CSSProperties = {
  position: 'relative',
  flex: 'none',
  width: 'var(--space-8)',
  height: 'var(--space-8)',
  borderRadius: 'var(--radius-chip)',
  overflow: 'hidden',
  isolation: 'isolate',
};

/**
 * The one multi-select step: occasions. Each chip is an image thumbnail plus a
 * label, toggling independently and holding the 44px tap target. Selected chips
 * tint with the accent and gain the ring; the flow supplies the Continue action.
 */
export function OccasionChips({ step, selectedIds, onToggle }: OccasionChipsProps) {
  const reduced = useReducedMotion();

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(2, 1fr)',
        gap: 'var(--space-3)',
      }}
    >
      {step.options.map((option) => {
        const selected = selectedIds.includes(option.id);
        return (
          <motion.button
            key={option.id}
            type="button"
            aria-label={option.label}
            aria-pressed={selected}
            onClick={() => onToggle(option.id)}
            style={{
              ...chipStyle,
              color: selected ? 'var(--color-text)' : 'var(--color-secondary-strong)',
              background: selected
                ? `color-mix(in srgb, var(--color-accent) ${SELECTED_TINT * 100}%, var(--color-surface))`
                : 'var(--color-surface)',
              border: `var(--glass-border-width) solid ${selected ? 'var(--color-accent)' : 'var(--color-hairline)'}`,
              boxShadow: selected ? SELECTION_RING : undefined,
            }}
            whileTap={reduced ? undefined : { scale: 0.97 }}
            transition={transitionFor(motionToken.springs.snappy, reduced)}
          >
            <span style={thumbStyle}>
              <QuizImage imageKey={'imageKey' in option ? option.imageKey : undefined} />
            </span>
            <TextControlBoundary>
              <Text variant="ui" size="subhead" weight={600} as="span">
                {option.label}
              </Text>
            </TextControlBoundary>
          </motion.button>
        );
      })}
    </div>
  );
}
