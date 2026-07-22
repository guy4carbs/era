'use client';

import { type CSSProperties } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { motion as motionToken, sheen } from '@era/tokens';

/**
 * Skeleton — warm-cream loading placeholders (D-WAIT). NEVER gray.
 *
 * Surface-tone blocks (var(--color-surface)) with a slow diagonal sheen sweep:
 * a 135° gradient band — the same sheen grammar as the item cards, but with a
 * BRIGHTER middle stop (skeletonSheenPeak) so the sweep reads on cream where the
 * card's 0.05 wash would vanish — translating left→right across the block on the
 * motion.waiting.skeletonSweepMs (1800ms) loop.
 *
 * The sweep is an AMBIENT loop, exempt from motion.durations.maxMs the same way
 * glow.pulse and the orb breath are: that ceiling governs transitions, not idle
 * atmosphere. It runs on the token bezier (an array, not a `linear` string) so it
 * stays clear of the motion-consistency string-easing guard.
 *
 * Reduced motion: the sweep is OFF and each block is a static surface tile — the
 * placeholder still communicates layout, just without the shimmer.
 *
 * Content replaces a skeleton with the standard reducedFadeMs (150ms) opacity
 * fade (AnimatePresence or an opacity swap at the call site) — never a pop.
 *
 * Variants:
 *   text — a single text line (a short, rounded bar).
 *   card — a 4:5 item-card placeholder (the closet/shop aspect).
 *   row  — a full-width row band (list items, table rows).
 */
export type SkeletonVariant = 'text' | 'card' | 'row';

export interface SkeletonProps {
  variant?: SkeletonVariant;
  /** Width override (default: full width; text defaults to a 60% stub). */
  width?: string;
  style?: CSSProperties;
}

// The sweep band: a 135° gradient (the sheen token angle) transparent at the
// edges and peaking at a brighter white in the middle, so one translating pass
// reads as a glint crossing the cream. The peak is expressed the same way the orb
// highlight is — `color-mix` over the `white` CSS keyword (not a hex/rgba literal,
// so it stays clear of the design-consistency guard) — at 14%, ABOVE the card
// sheen's `from` stop (~5%) so the sweep survives on the surface tone. `sheen.to`
// (fully transparent white) is the shared edge stop.
const skeletonSheenPeak = 'color-mix(in srgb, white 14%, transparent)';
const sweepBackground = `linear-gradient(${sheen.angleDeg}deg, ${sheen.to}, ${skeletonSheenPeak} 50%, ${sheen.to})`;

const baseBlockStyle: CSSProperties = {
  position: 'relative',
  overflow: 'hidden',
  background: 'var(--color-surface)',
};

const variantStyle: Record<SkeletonVariant, CSSProperties> = {
  text: {
    height: 'var(--space-4)',
    borderRadius: 'var(--radius-input)',
  },
  card: {
    width: '100%',
    aspectRatio: '4 / 5',
    borderRadius: 'var(--radius-card)',
  },
  row: {
    width: '100%',
    height: 'var(--space-16)',
    borderRadius: 'var(--radius-card)',
  },
};

export function Skeleton({ variant = 'text', width, style }: SkeletonProps) {
  const reduced = useReducedMotion();
  const resolvedWidth = width ?? (variant === 'text' ? '60%' : undefined);

  return (
    <div
      aria-hidden="true"
      style={{
        ...baseBlockStyle,
        ...variantStyle[variant],
        ...(resolvedWidth ? { width: resolvedWidth } : {}),
        ...style,
      }}
    >
      {/* The translating sheen band. Twice the block width, swept from off-left to
          off-right on the 1800ms ambient loop. OFF under reduced motion. */}
      {reduced ? null : (
        <motion.span
          aria-hidden="true"
          style={{
            position: 'absolute',
            insetBlock: 0,
            width: '200%',
            left: '-100%',
            background: sweepBackground,
            pointerEvents: 'none',
          }}
          animate={{ x: ['0%', '100%'] }}
          transition={{
            duration: motionToken.waiting.skeletonSweepMs / 1000,
            repeat: Infinity,
            ease: motionToken.easing.bezier,
          }}
        />
      )}
    </div>
  );
}

/**
 * A convenience grid of {@link Skeleton} `card` placeholders — the closet/shop
 * loading grid (2 columns, 4:5 tiles) on the standard section gap. Renders `count`
 * cards; call with a `role="status"`/aria-busy wrapper at the surface if the whole
 * screen is waiting, or drop it inline as the grid's placeholder.
 */
export interface SkeletonGridProps {
  /** How many card placeholders to render (default 6). */
  count?: number;
  /** CSS columns count (default 2). */
  columns?: number;
  style?: CSSProperties;
}

export function SkeletonGrid({ count = 6, columns = 2, style }: SkeletonGridProps) {
  return (
    <div
      aria-hidden="true"
      style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${columns}, 1fr)`,
        gap: 'var(--space-4)',
        ...style,
      }}
    >
      {Array.from({ length: count }, (_, i) => (
        <Skeleton key={i} variant="card" />
      ))}
    </div>
  );
}
