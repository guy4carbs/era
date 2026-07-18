'use client';

import { type CSSProperties } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { motion as motionToken, layout } from '@era/tokens';
import { ARCHETYPES } from '@era/core/quiz';
import { transitionFor } from '../../../lib/motion';
import { Text, TextControlBoundary } from '../../../components';
import { SELECTION_RING, type QuizStep } from '../types';

export interface PaletteBoardsProps {
  step: QuizStep;
  selectedId?: string;
  onSelect: (optionId: string) => void;
}

/** Unique, order-preserving flatten of a hex list pulled from the archetypes. */
const dedupe = (hexes: readonly string[]): string[] => [...new Set(hexes)];

// Palette swatches are DATA sourced from the archetype dictionary, never typed
// literals: `anchorHexes` are the neutral bases, `accentHexes` the pops.
const NEUTRALS = dedupe(Object.values(ARCHETYPES).flatMap((a) => a.anchorHexes));
const ACCENTS = dedupe(Object.values(ARCHETYPES).flatMap((a) => a.accentHexes));

const BOARD_SIZE = 6;

/** Build the swatch set for a palette option id from the archetype colours. */
function swatchesFor(optionId: string): string[] {
  switch (optionId) {
    case 'all_neutrals':
      return NEUTRALS.slice(0, BOARD_SIZE);
    case 'neutral_pops':
      return [...NEUTRALS.slice(0, BOARD_SIZE - 2), ...ACCENTS.slice(0, 2)];
    case 'full_color':
      return ACCENTS.slice(0, BOARD_SIZE);
    default:
      return NEUTRALS.slice(0, BOARD_SIZE);
  }
}

const boardStyle: CSSProperties = {
  position: 'relative',
  width: '100%',
  padding: 'var(--space-3)',
  border: 'none',
  borderRadius: 'var(--radius-card)',
  cursor: 'pointer',
  background: 'var(--color-surface)',
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-3)',
  alignItems: 'stretch',
};

const swatchGridStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(3, 1fr)',
  gap: 'var(--space-1)',
  borderRadius: 'var(--radius-card)',
  overflow: 'hidden',
};

const labelStyle: CSSProperties = {
  color: 'var(--color-text)',
  textAlign: 'start',
};

/**
 * Three token-rendered palette boards — neutrals, neutrals with a pop, and a
 * full-colour spread — built from the archetype anchor/accent sets rather than
 * photos. Single-select; the chosen board lifts to e3 with the accent ring.
 */
export function PaletteBoards({ step, selectedId, onSelect }: PaletteBoardsProps) {
  const reduced = useReducedMotion();

  return (
    <div style={{ display: 'grid', gap: 'var(--space-3)' }}>
      {step.options.map((option) => {
        const selected = option.id === selectedId;
        const swatches = swatchesFor(option.id);
        return (
          <motion.button
            key={option.id}
            type="button"
            aria-label={option.label}
            aria-pressed={selected}
            onClick={() => onSelect(option.id)}
            style={{
              ...boardStyle,
              boxShadow: selected ? `var(--shadow-e3), ${SELECTION_RING}` : 'var(--shadow-e2)',
            }}
            whileHover={reduced ? undefined : { y: layout.hover.liftPx, boxShadow: 'var(--shadow-e3)' }}
            whileTap={reduced ? undefined : { scale: 0.98 }}
            transition={transitionFor(motionToken.springs.snappy, reduced)}
          >
            <div style={swatchGridStyle} aria-hidden="true">
              {swatches.map((hex, i) => (
                <span
                  key={`${hex}-${i}`}
                  style={{ aspectRatio: '1 / 1', background: hex }}
                />
              ))}
            </div>
            <TextControlBoundary>
              <Text variant="ui" size="subhead" weight={600} as="span" style={labelStyle}>
                {option.label}
              </Text>
            </TextControlBoundary>
          </motion.button>
        );
      })}
    </div>
  );
}
