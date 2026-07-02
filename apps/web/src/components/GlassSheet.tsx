'use client';

import { useState, type CSSProperties, type ReactNode } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { motion as motionToken, glass, boxShadows, layout } from '@era/tokens';
import { transitionFor } from '../lib/motion';

export interface GlassSheetProps {
  children: ReactNode;
  /** Start at a partial peek height (fraction from tokens), expandable to full. */
  peek?: boolean;
  style?: CSSProperties;
}

const PEEK_HEIGHT = `${layout.sheetPeekFraction * 100}vh`;
const FULL_HEIGHT = 'calc(100vh - var(--space-8))';

const sheetStyle: CSSProperties = {
  position: 'fixed',
  left: 0,
  right: 0,
  bottom: 0,
  display: 'flex',
  flexDirection: 'column',
  background: `color-mix(in srgb, var(--color-surface) var(--glass-tint), transparent)`,
  backdropFilter: 'blur(var(--glass-blur))',
  WebkitBackdropFilter: 'blur(var(--glass-blur))',
  borderTop: 'var(--glass-border-width) solid var(--color-hairline)',
  borderLeft: 'var(--glass-border-width) solid var(--color-hairline)',
  borderRight: 'var(--glass-border-width) solid var(--color-hairline)',
  borderTopLeftRadius: 'var(--radius-sheet)',
  borderTopRightRadius: 'var(--radius-sheet)',
  // e4 lift plus a 1px inner highlight along the top edge (glass token colour).
  boxShadow: `${boxShadows.e4}, inset 0 1px 0 0 ${glass.innerHighlightColor}`,
  paddingInline: 'var(--space-4)',
  paddingBottom: 'var(--space-4)',
  zIndex: 50,
};

const handleWrapStyle: CSSProperties = {
  display: 'flex',
  justifyContent: 'center',
  padding: 'var(--space-2)',
  background: 'transparent',
  border: 'none',
  cursor: 'pointer',
};

const grabberStyle: CSSProperties = {
  width: 'var(--space-8)',
  height: 'var(--space-1)',
  borderRadius: 'var(--radius-chip)',
  background: 'var(--color-hairline)',
};

/**
 * Frosted sheet that slides up from the bottom (gentle spring, fade under
 * reduced motion). With `peek`, it opens partway and expands to full height when
 * the grabber is tapped.
 */
export function GlassSheet({ children, peek, style }: GlassSheetProps) {
  const reduced = useReducedMotion();
  const [expanded, setExpanded] = useState(false);

  const height = expanded || !peek ? FULL_HEIGHT : PEEK_HEIGHT;

  const enter = reduced
    ? { initial: { opacity: 0 }, animate: { opacity: 1 } }
    : { initial: { y: '100%' }, animate: { y: 0 } };

  return (
    <motion.section
      role="dialog"
      aria-modal="true"
      style={{ ...sheetStyle, height, ...style }}
      initial={enter.initial}
      animate={{ ...enter.animate, height }}
      transition={transitionFor(motionToken.springs.gentle, reduced)}
    >
      {peek ? (
        <button
          type="button"
          style={handleWrapStyle}
          aria-label={expanded ? 'Collapse sheet' : 'Expand sheet'}
          aria-expanded={expanded}
          onClick={() => setExpanded((value) => !value)}
        >
          <span style={grabberStyle} aria-hidden="true" />
        </button>
      ) : null}
      <div style={{ overflowY: 'auto', flex: 1 }}>{children}</div>
    </motion.section>
  );
}
