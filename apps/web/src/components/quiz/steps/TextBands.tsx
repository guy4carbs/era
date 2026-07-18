'use client';

import { type CSSProperties } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { motion as motionToken, layout } from '@era/tokens';
import { transitionFor } from '../../../lib/motion';
import { Text, TextControlBoundary } from '../../../components';
import { SELECTION_RING, type QuizStep } from '../types';

export interface TextBandsProps {
  step: QuizStep;
  selectedId?: string;
  onSelect: (optionId: string) => void;
}

const bandStyle: CSSProperties = {
  width: '100%',
  padding: 'var(--space-4)',
  border: 'none',
  borderRadius: 'var(--radius-card)',
  cursor: 'pointer',
  background: 'var(--color-surface)',
  textAlign: 'start',
  color: 'var(--color-text)',
};

/**
 * The budget step: four plain text bands, no imagery. Single-select; the chosen
 * band lifts to e3 with the accent ring. Copy is the option label from the quiz
 * definition — this renderer adds no prose of its own.
 */
export function TextBands({ step, selectedId, onSelect }: TextBandsProps) {
  const reduced = useReducedMotion();

  return (
    <div style={{ display: 'grid', gap: 'var(--space-3)' }}>
      {step.options.map((option) => {
        const selected = option.id === selectedId;
        return (
          <motion.button
            key={option.id}
            type="button"
            aria-label={option.label}
            aria-pressed={selected}
            onClick={() => onSelect(option.id)}
            style={{
              ...bandStyle,
              boxShadow: selected ? `var(--shadow-e3), ${SELECTION_RING}` : 'var(--shadow-e2)',
            }}
            whileHover={reduced ? undefined : { y: layout.hover.liftPx, boxShadow: 'var(--shadow-e3)' }}
            whileTap={reduced ? undefined : { scale: motionToken.press.scale }}
            transition={transitionFor(motionToken.springs.snappy, reduced)}
          >
            <TextControlBoundary>
              <Text variant="ui" size="title3" weight={600} as="span">
                {option.label}
              </Text>
            </TextControlBoundary>
          </motion.button>
        );
      })}
    </div>
  );
}
