'use client';

import { type CSSProperties } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { motion as motionToken, layout } from '@era/tokens';
import { strings } from '@era/core/strings';
import { transitionFor } from '../../../lib/motion';
import { Text, TextControlBoundary } from '../../../components';
import { SELECTION_RING, type QuizStep } from '../types';

export interface MoodCardsProps {
  step: QuizStep;
  selectedId?: string;
  onSelect: (optionId: string) => void;
}

type MoodId = keyof typeof strings.quiz.moods;

const isMoodId = (id: string): id is MoodId => id in strings.quiz.moods;

const cardStyle: CSSProperties = {
  width: '100%',
  padding: 'var(--space-4)',
  border: 'none',
  borderRadius: 'var(--radius-hero)',
  cursor: 'pointer',
  background: 'var(--color-surface)',
  textAlign: 'start',
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-1)',
};

const titleStyle: CSSProperties = {
  color: 'var(--color-text)',
};

const taglineStyle: CSSProperties = {
  color: 'var(--color-secondary-strong)',
};

/**
 * The closing "era I'm entering" step: six mood cards. Title and tagline come
 * from the shared mood copy (the option label may be blank for this step), so
 * the accessible name falls back to the mood title. Single-select at hero radius.
 */
export function MoodCards({ step, selectedId, onSelect }: MoodCardsProps) {
  const reduced = useReducedMotion();

  return (
    <div style={{ display: 'grid', gap: 'var(--space-3)' }}>
      {step.options.map((option) => {
        const mood = isMoodId(option.id) ? strings.quiz.moods[option.id] : null;
        const title = mood?.title ?? option.label;
        const selected = option.id === selectedId;
        return (
          <motion.button
            key={option.id}
            type="button"
            aria-label={title}
            aria-pressed={selected}
            onClick={() => onSelect(option.id)}
            style={{
              ...cardStyle,
              boxShadow: selected ? `var(--shadow-e3), ${SELECTION_RING}` : 'var(--shadow-e2)',
            }}
            whileHover={reduced ? undefined : { y: layout.hover.liftPx, boxShadow: 'var(--shadow-e3)' }}
            whileTap={reduced ? undefined : { scale: motionToken.press.scale }}
            transition={transitionFor(motionToken.springs.snappy, reduced)}
          >
            <TextControlBoundary>
              <Text variant="ui" size="title2" weight={600} as="span" style={titleStyle}>
                {title}
              </Text>
              {mood ? (
                <Text variant="caption" size="footnote" as="span" style={taglineStyle}>
                  {mood.tagline}
                </Text>
              ) : null}
            </TextControlBoundary>
          </motion.button>
        );
      })}
    </div>
  );
}
