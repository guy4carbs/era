'use client';

import { type CSSProperties } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { motion as motionToken, boxShadows, layout } from '@era/tokens';
import { transitionFor } from '../../../lib/motion';
import { Text, TextControlBoundary } from '../../../components';
import { QuizImage } from '../QuizImage';
import { SELECTION_RING, type QuizStep } from '../types';

export interface PhotoOptionGridProps {
  step: QuizStep;
  selectedId?: string;
  onSelect: (optionId: string) => void;
}

const tileStyle: CSSProperties = {
  position: 'relative',
  aspectRatio: layout.itemCard.aspectRatio,
  width: '100%',
  padding: 0,
  border: 'none',
  borderRadius: 'var(--radius-card)',
  overflow: 'hidden',
  isolation: 'isolate',
  cursor: 'pointer',
  background: 'var(--color-surface)',
};

const captionStyle: CSSProperties = {
  position: 'absolute',
  left: 0,
  right: 0,
  bottom: 0,
  zIndex: 2,
  paddingInline: 'var(--space-3)',
  paddingBlock: 'var(--space-2)',
  textAlign: 'start',
  color: 'var(--color-text)',
  background: `color-mix(in srgb, var(--color-surface) var(--glass-tint), transparent)`,
  backdropFilter: 'blur(var(--glass-blur))',
  WebkitBackdropFilter: 'blur(var(--glass-blur))',
  borderTop: 'var(--glass-border-width) solid var(--color-hairline)',
};

/**
 * The photographic option grid: two columns for four-or-fewer options, three
 * for five or six. Each tile is a 4:5 image card with a glass caption band;
 * the selected tile lifts to e3 and gains the accent ring. Tapping a tile fires
 * `onSelect`, which the flow uses to record the answer and auto-advance.
 */
export function PhotoOptionGrid({ step, selectedId, onSelect }: PhotoOptionGridProps) {
  const reduced = useReducedMotion();
  const columns = step.options.length <= 4 ? 2 : 3;

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${columns}, 1fr)`,
        gap: 'var(--space-3)',
      }}
    >
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
              ...tileStyle,
              boxShadow: selected ? `${boxShadows.e3}, ${SELECTION_RING}` : boxShadows.e2,
            }}
            whileHover={reduced ? undefined : { y: layout.hover.liftPx, boxShadow: boxShadows.e3 }}
            whileTap={reduced ? undefined : { scale: 0.97 }}
            transition={transitionFor(motionToken.springs.snappy, reduced)}
          >
            <QuizImage imageKey={'imageKey' in option ? option.imageKey : undefined} />
            <TextControlBoundary>
              <Text variant="ui" size="subhead" weight={600} as="span" style={captionStyle}>
                {option.label}
              </Text>
            </TextControlBoundary>
          </motion.button>
        );
      })}
    </div>
  );
}
