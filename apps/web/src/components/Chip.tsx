'use client';

import { type CSSProperties, type ReactNode } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { typeRamp } from '@era/tokens';
import { pressProps } from '../lib/motion';
import { Text, TextControlBoundary } from './Text';

type NativeButtonProps = Omit<
  React.ComponentPropsWithoutRef<'button'>,
  'onAnimationStart' | 'onAnimationEnd' | 'onDrag' | 'onDragStart' | 'onDragEnd' | 'style' | 'ref'
>;

export interface ChipProps extends NativeButtonProps {
  selected?: boolean;
  children: ReactNode;
  style?: CSSProperties;
}

/** Accent fill strength for the selected state (fraction, not a dimension). */
const SELECTED_TINT = 0.16;

const chipStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  // Hitbox stays at the 44px minimum even though the pill reads smaller.
  minHeight: 'var(--touch-target-min)',
  paddingInline: 'var(--space-3)',
  borderRadius: 'var(--radius-chip)',
  fontSize: typeRamp.footnote.rem,
  lineHeight: `${typeRamp.footnote.lineHeight}px`,
  fontWeight: 600,
  cursor: 'pointer',
  whiteSpace: 'nowrap',
};

/**
 * Selectable pill. Springs on toggle (snappy), tints with the accent when
 * selected, and holds its 44px tap target regardless of visual size.
 */
export function Chip({ selected = false, children, style, ...rest }: ChipProps) {
  const reduced = useReducedMotion();

  const selectedStyle: CSSProperties = selected
    ? {
        background: `color-mix(in srgb, var(--color-accent) ${SELECTED_TINT * 100}%, transparent)`,
        border: '1px solid var(--color-accent)',
        color: 'var(--color-text)',
      }
    : {
        background: 'var(--color-surface)',
        border: '1px solid var(--color-hairline)',
        color: 'var(--color-secondary-strong)',
      };

  return (
    <motion.button
      type="button"
      aria-pressed={selected}
      style={{ ...chipStyle, ...selectedStyle, ...style }}
      {...pressProps(reduced)}
      {...rest}
    >
      <TextControlBoundary>
        <Text variant="ui" as="span" size="footnote">
          {children}
        </Text>
      </TextControlBoundary>
    </motion.button>
  );
}
