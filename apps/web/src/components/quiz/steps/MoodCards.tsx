'use client';

import { type CSSProperties } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { motion as motionToken, typeRamp, boxShadows, layout } from '@era/tokens';
import { strings } from '@era/core/strings';
import { transitionFor } from '../../../lib/motion';
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
  fontSize: typeRamp.title2.rem,
  lineHeight: `${typeRamp.title2.lineHeight}px`,
  fontWeight: 600,
  color: 'var(--color-text)',
};

const taglineStyle: CSSProperties = {
  fontSize: typeRamp.footnote.rem,
  lineHeight: `${typeRamp.footnote.lineHeight}px`,
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
              boxShadow: selected ? `${boxShadows.e3}, ${SELECTION_RING}` : boxShadows.e2,
            }}
            whileHover={reduced ? undefined : { y: layout.hover.liftPx, boxShadow: boxShadows.e3 }}
            whileTap={reduced ? undefined : { scale: 0.98 }}
            transition={transitionFor(motionToken.springs.snappy, reduced)}
          >
            <span style={titleStyle}>{title}</span>
            {mood ? <span style={taglineStyle}>{mood.tagline}</span> : null}
          </motion.button>
        );
      })}
    </div>
  );
}
