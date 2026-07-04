'use client';

import { type CSSProperties } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { motion as motionToken, typeRamp, boxShadows } from '@era/tokens';
import { transitionFor } from '../../lib/motion';
import {
  clamp,
  ROTATION_MAX,
  ROTATION_MIN,
  ROTATION_STEP,
  SCALE_MAX,
  SCALE_MIN,
  SCALE_STEP,
  type PlacedItem,
} from './types';

export interface ItemControlBarProps {
  piece: PlacedItem;
  /** True when the piece is already at the top of the stack. */
  atFront: boolean;
  /** True when the piece is already at the bottom of the stack. */
  atBack: boolean;
  onScale: (scale: number) => void;
  onRotate: (rotation: number) => void;
  onForward: () => void;
  onBackward: () => void;
  onRemove: () => void;
}

const barStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 'var(--space-2)',
  flexWrap: 'wrap',
  justifyContent: 'center',
  padding: 'var(--space-2)',
  borderRadius: 'var(--radius-sheet)',
  background: `color-mix(in srgb, var(--color-surface) var(--glass-tint), transparent)`,
  backdropFilter: 'blur(var(--glass-blur))',
  WebkitBackdropFilter: 'blur(var(--glass-blur))',
  border: 'var(--glass-border-width) solid var(--color-hairline)',
  boxShadow: boxShadows.e2,
};

const btnStyle: CSSProperties = {
  minWidth: 'var(--touch-target-min)',
  minHeight: 'var(--touch-target-min)',
  paddingInline: 'var(--space-3)',
  borderRadius: 'var(--radius-chip)',
  border: '1px solid var(--color-hairline)',
  background: 'var(--color-surface)',
  color: 'var(--color-text)',
  fontSize: typeRamp.footnote.rem,
  fontWeight: 600,
  cursor: 'pointer',
};

const removeStyle: CSSProperties = {
  ...btnStyle,
  color: 'var(--color-rust)',
  borderColor: 'var(--color-rust)',
};

const labelStyle: CSSProperties = {
  fontSize: typeRamp.footnote.rem,
  color: 'var(--color-secondary-strong)',
  minWidth: 'var(--space-8)',
  textAlign: 'center',
};

/**
 * The control bar for the selected piece: resize, rotate, restack, remove. Drag
 * moves the piece; these buttons own everything else. Values clamp to the pinned
 * transform contract so the outfit always saves. Springs in on the gentle scale,
 * fades under reduced motion.
 */
export function ItemControlBar({
  piece,
  atFront,
  atBack,
  onScale,
  onRotate,
  onForward,
  onBackward,
  onRemove,
}: ItemControlBarProps) {
  const reduced = useReducedMotion();

  return (
    <motion.div
      role="group"
      aria-label="Adjust piece"
      style={barStyle}
      initial={reduced ? { opacity: 0 } : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={reduced ? { opacity: 0 } : { opacity: 0, y: 8 }}
      transition={transitionFor(motionToken.springs.gentle, reduced)}
    >
      <button type="button" aria-label="Smaller" style={btnStyle} onClick={() => onScale(clamp(piece.scale - SCALE_STEP, SCALE_MIN, SCALE_MAX))}>
        −
      </button>
      <span style={labelStyle} aria-hidden="true">{`${Math.round(piece.scale * 100)}%`}</span>
      <button type="button" aria-label="Larger" style={btnStyle} onClick={() => onScale(clamp(piece.scale + SCALE_STEP, SCALE_MIN, SCALE_MAX))}>
        +
      </button>

      <button type="button" aria-label="Rotate left" style={btnStyle} onClick={() => onRotate(clamp(piece.rotation - ROTATION_STEP, ROTATION_MIN, ROTATION_MAX))}>
        ↺
      </button>
      <button type="button" aria-label="Rotate right" style={btnStyle} onClick={() => onRotate(clamp(piece.rotation + ROTATION_STEP, ROTATION_MIN, ROTATION_MAX))}>
        ↻
      </button>

      <button type="button" aria-label="Send backward" style={btnStyle} disabled={atBack} onClick={onBackward}>
        ⤓
      </button>
      <button type="button" aria-label="Bring forward" style={btnStyle} disabled={atFront} onClick={onForward}>
        ⤒
      </button>

      <button type="button" style={removeStyle} onClick={onRemove}>
        Remove
      </button>
    </motion.div>
  );
}
