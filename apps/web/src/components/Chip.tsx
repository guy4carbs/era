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
  /**
   * Quiet glass treatment (D8 closet filters): the unselected rest state becomes
   * a frosted surface — the §3 glass recipe at chip scale (tint + blur/saturate +
   * hairline border), no shadow escalation. Selected keeps the accent fill.
   */
  glass?: boolean;
  children: ReactNode;
  style?: CSSProperties;
}

/** Accent fill strength for the selected state (fraction, not a dimension). */
const SELECTED_TINT = 0.16;

// Chip-scale glass: the §3 recipe (color-mix tint + blur/saturate) sized for a
// pill — the same vars GlassPanel composes, minus the elevation/highlight, so it
// stays quiet. Radius stays the chip's own; no shadow.
const glassRestStyle: CSSProperties = {
  background: 'color-mix(in srgb, var(--color-surface) var(--glass-tint), transparent)',
  backdropFilter: 'blur(var(--glass-blur)) saturate(var(--glass-saturate))',
  WebkitBackdropFilter: 'blur(var(--glass-blur)) saturate(var(--glass-saturate))',
  border: 'var(--glass-border-width) solid var(--glass-border)',
  color: 'var(--color-secondary-strong)',
};

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
export function Chip({ selected = false, glass = false, children, style, ...rest }: ChipProps) {
  const reduced = useReducedMotion();

  const restStyle: CSSProperties = glass
    ? glassRestStyle
    : {
        background: 'var(--color-surface)',
        border: 'var(--glass-border-width) solid var(--color-hairline)',
        color: 'var(--color-secondary-strong)',
      };

  const selectedStyle: CSSProperties = selected
    ? {
        background: `color-mix(in srgb, var(--color-accent) ${SELECTED_TINT * 100}%, transparent)`,
        border: 'var(--glass-border-width) solid var(--color-accent)',
        color: 'var(--color-text)',
      }
    : restStyle;

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
