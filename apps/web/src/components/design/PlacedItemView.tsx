'use client';

import { useCallback, useEffect, useRef, type CSSProperties } from 'react';
import { animate, motion, useMotionValue, useReducedMotion, type MotionValue } from 'framer-motion';
import { motion as motionToken, typeRamp } from '@era/tokens';
import { strings } from '@era/core/strings';
import { springTransition, transitionFor } from '../../lib/motion';
import { applySnap, type Guide } from './snapping';
import { clamp, SNAP_THRESHOLD, type PlacedItem } from './types';

export interface PlacedItemViewProps {
  piece: PlacedItem;
  selected: boolean;
  stageWidth: number;
  stageHeight: number;
  /** The OTHER pieces' normalized centers, for center-to-center snapping. */
  others: { posX: number; posY: number }[];
  onSelect: () => void;
  onCommit: (posX: number, posY: number) => void;
  onGuides: (guides: Guide[]) => void;
}

// A 0-size anchor at the piece's center; framer drags it, children bubble their
// pointer events up so the whole cutout is the drag handle.
const anchorStyle: CSSProperties = {
  position: 'absolute',
  left: 0,
  top: 0,
  width: 0,
  height: 0,
  touchAction: 'none',
};

// Centered on the anchor at ANY scale/rotation: width is real layout (not a
// transform), so translate(-50%,-50%) lands the geometric center on the anchor.
const centerWrapStyle: CSSProperties = {
  position: 'absolute',
  left: 0,
  top: 0,
  transform: 'translate(-50%, -50%)',
};

const fallbackStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  aspectRatio: '4 / 5',
  borderRadius: 'var(--radius-card)',
  background: 'var(--color-surface)',
  border: '1px solid var(--color-hairline)',
  color: 'var(--color-secondary-strong)',
  fontSize: typeRamp.footnote.rem,
  textAlign: 'center',
  padding: 'var(--space-2)',
};

/**
 * One placed cutout: a draggable, selectable, scalable, rotatable piece. Drag
 * tracks the finger directly; when its center nears the stage center or another
 * piece's center (via {@link applySnap}) it eases onto that guide with a fluid
 * spring, so the piece glides the last few px onto the line instead of jumping.
 * Selection draws an accent ring; scale is real layout width (so it composes
 * 1:1 into the cover) and rotation springs on the snappy scale. Under reduced
 * motion the drag still works directly and the snap is a hard set (no spring);
 * only the decorative ring glow is dropped.
 */
export function PlacedItemView({
  piece,
  selected,
  stageWidth,
  stageHeight,
  others,
  onSelect,
  onCommit,
  onGuides,
}: PlacedItemViewProps) {
  const reduced = useReducedMotion();
  const x = useMotionValue(piece.posX * stageWidth);
  const y = useMotionValue(piece.posY * stageHeight);
  const dragging = useRef(false);
  // The snap coordinate (px) each axis is currently eased onto, or null when the
  // axis is tracking the finger. Edge-detects engage so the fluid spring fires
  // once per guide rather than restarting every drag frame.
  const snapTargetX = useRef<number | null>(null);
  const snapTargetY = useRef<number | null>(null);

  // Keep the motion values pinned to the committed transform whenever it changes
  // from outside a drag: reopen hydration, control edits, and stage resize.
  useEffect(() => {
    if (dragging.current) return;
    x.set(piece.posX * stageWidth);
    y.set(piece.posY * stageHeight);
  }, [piece.posX, piece.posY, stageWidth, stageHeight, x, y]);

  // Ease an axis onto its snap coordinate with the fluid spring; under reduced
  // motion drop the spring for a direct set, matching how the app sheds motion.
  const settleAxis = useCallback(
    (value: MotionValue<number>, to: number) => {
      if (reduced) {
        value.set(to);
      } else {
        animate(value, to, springTransition(motionToken.springs.fluid));
      }
    },
    [reduced],
  );

  function handleDrag() {
    const cx = clamp(x.get(), 0, stageWidth);
    const cy = clamp(y.get(), 0, stageHeight);
    const snapped = applySnap(cx, cy, stageWidth, stageHeight, others, SNAP_THRESHOLD);
    const snapX = snapped.guides.some((g) => g.axis === 'x');
    const snapY = snapped.guides.some((g) => g.axis === 'y');

    // On a snapping axis, glide onto the guide once (re-firing only if the
    // target moves to a different piece). Off it, track the finger directly.
    if (snapX) {
      if (snapTargetX.current !== snapped.x) {
        snapTargetX.current = snapped.x;
        settleAxis(x, snapped.x);
      }
    } else {
      snapTargetX.current = null;
      x.set(cx);
    }

    if (snapY) {
      if (snapTargetY.current !== snapped.y) {
        snapTargetY.current = snapped.y;
        settleAxis(y, snapped.y);
      }
    } else {
      snapTargetY.current = null;
      y.set(cy);
    }

    onGuides(snapped.guides);
  }

  function handleDragEnd() {
    dragging.current = false;
    snapTargetX.current = null;
    snapTargetY.current = null;
    onGuides([]);
    const px = stageWidth > 0 ? clamp(x.get() / stageWidth, 0, 1) : piece.posX;
    const py = stageHeight > 0 ? clamp(y.get() / stageHeight, 0, 1) : piece.posY;
    onCommit(px, py);
  }

  const pxWidth = Math.max(0, piece.scale * stageWidth);
  const ring = selected
    ? {
        outline: '2px solid var(--color-accent)',
        outlineOffset: '2px',
        borderRadius: 'var(--radius-card)',
        boxShadow: reduced
          ? undefined
          : '0 0 var(--glow-blur) color-mix(in srgb, var(--color-accent) 40%, transparent)',
      }
    : null;

  return (
    <motion.div
      style={{ ...anchorStyle, x, y, zIndex: piece.layerOrder }}
      drag
      dragMomentum={false}
      dragElastic={0}
      onPointerDown={onSelect}
      onDragStart={() => {
        dragging.current = true;
        onSelect();
      }}
      onDrag={handleDrag}
      onDragEnd={handleDragEnd}
    >
      <div style={centerWrapStyle}>
        <motion.div
          style={{ width: pxWidth, cursor: 'grab', ...ring }}
          animate={{ rotate: piece.rotation }}
          transition={transitionFor(motionToken.springs.snappy, reduced)}
        >
          {piece.displayUrl ? (
            <img
              src={piece.displayUrl}
              alt={piece.name}
              draggable={false}
              style={{ width: '100%', height: 'auto', display: 'block', pointerEvents: 'none' }}
            />
          ) : (
            <div style={fallbackStyle}>{strings.closet.categoryLabel(piece.category)}</div>
          )}
        </motion.div>
      </div>
    </motion.div>
  );
}
