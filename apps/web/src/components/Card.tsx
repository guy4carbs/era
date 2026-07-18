'use client';

import { type CSSProperties, type ReactNode } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { motion as motionToken, layout } from '@era/tokens';
import { transitionFor } from '../lib/motion';

export interface CardProps {
  children: ReactNode;
  /** Lift and deepen on hover. */
  interactive?: boolean;
  /** `item` gives a 4:5 closet-item frame with inner padding + sheen. */
  aspect?: 'item';
  style?: CSSProperties;
  onClick?: () => void;
}

const baseStyle: CSSProperties = {
  position: 'relative',
  background: 'var(--color-surface)',
  borderRadius: 'var(--radius-card)',
  boxShadow: 'var(--shadow-e2)',
  overflow: 'hidden',
  isolation: 'isolate',
};

const itemStyle: CSSProperties = {
  aspectRatio: '4 / 5',
  padding: 'var(--item-card-padding)',
};

/** Sheen sweep for item cards only. */
const sheenOverlay: CSSProperties = {
  position: 'absolute',
  inset: 0,
  pointerEvents: 'none',
  background: 'var(--sheen-gradient)',
  zIndex: 1,
};

const contentStyle: CSSProperties = { position: 'relative', zIndex: 2, height: '100%' };

/**
 * Surface container at e2. When `interactive`, it lifts and deepens toward e3 on
 * hover (spring, or a plain fade under reduced motion). `aspect="item"` frames
 * closet items at 4:5 with a subtle sheen.
 */
export function Card({ children, interactive, aspect, style, onClick }: CardProps) {
  const reduced = useReducedMotion();
  const canHover = interactive && !reduced;
  // A card only presses when it actually does something on tap (has an onClick).
  const clickable = onClick !== undefined;

  return (
    <motion.div
      style={{ ...baseStyle, ...(aspect === 'item' ? itemStyle : null), ...(clickable ? { cursor: 'pointer' } : null), ...style }}
      whileHover={canHover ? { y: layout.hover.liftPx, boxShadow: 'var(--shadow-e3)' } : undefined}
      whileTap={clickable && !reduced ? { scale: motionToken.press.scale } : undefined}
      transition={transitionFor(motionToken.springs.gentle, reduced)}
      onClick={onClick}
    >
      {aspect === 'item' ? <span style={sheenOverlay} aria-hidden="true" /> : null}
      <div style={contentStyle}>{children}</div>
    </motion.div>
  );
}
