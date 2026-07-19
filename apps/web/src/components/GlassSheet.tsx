'use client';

import { useState, type CSSProperties, type ReactNode } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { motion as motionToken, layout } from '@era/tokens';
import { transitionFor } from '../lib/motion';
import { glassSurfaceStyle } from './GlassPanel';

export interface GlassSheetProps {
  children: ReactNode;
  /** Start at a partial peek height (fraction from tokens), expandable to full. */
  peek?: boolean;
  /** Id of the element naming this dialog, wired to aria-labelledby. */
  labelledBy?: string;
  /**
   * Float over IMAGERY — swaps the glass to the AA-guaranteed minimum-contrast
   * scrim. Sheets over chrome leave this off. Default false.
   */
  busy?: boolean;
  style?: CSSProperties;
}

const PEEK_HEIGHT = `${layout.sheetPeekFraction * 100}vh`;
const FULL_HEIGHT = 'calc(100vh - var(--space-8))';

/**
 * The sheet's chrome = the §3 glass recipe plus the bottom-anchored positional
 * and padding extras. The recipe supplies background/blur+saturate/border/
 * highlight/shadow; its all-sides `border` and full `borderRadius` are then
 * overridden to a top+sides frame with only the top corners rounded (the sheet's
 * bottom edge sits off-screen).
 */
function sheetStyleFor(busy: boolean): CSSProperties {
  return {
    ...glassSurfaceStyle({ busy }),
    position: 'fixed',
    left: 0,
    right: 0,
    bottom: 0,
    display: 'flex',
    flexDirection: 'column',
    // A bottom-anchored sheet frames only its top + sides (bottom is off-screen)
    // and rounds only the top corners; drop the recipe's all-sides border and
    // full radius, then set the top/side frame explicitly.
    border: undefined,
    borderRadius: undefined,
    borderTop: 'var(--glass-border-width) solid var(--glass-border)',
    borderLeft: 'var(--glass-border-width) solid var(--glass-border)',
    borderRight: 'var(--glass-border-width) solid var(--glass-border)',
    borderTopLeftRadius: 'var(--radius-sheet)',
    borderTopRightRadius: 'var(--radius-sheet)',
    paddingInline: 'var(--space-4)',
    paddingBottom: 'var(--space-4)',
    zIndex: 50,
  };
}

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
export function GlassSheet({ children, peek, labelledBy, busy = false, style }: GlassSheetProps) {
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
      aria-labelledby={labelledBy}
      style={{ ...sheetStyleFor(busy), height, ...style }}
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
