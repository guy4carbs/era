'use client';

import { useRef, type CSSProperties } from 'react';
import {
  motion,
  useReducedMotion,
  useScroll,
  useTransform,
  type MotionValue,
} from 'motion/react';
import { motion as motionToken } from '@era/tokens';
import { ItemSurface } from '../index';

/**
 * Section 1's live embed: a small collage of REAL {@link ItemSurface} cards — the
 * same cream 4:5 item engine used across the app, holding the shipped cutout
 * PNGs — that lean gently as the section scrolls through the viewport. The tilt
 * is driven by page scroll (`useScroll`/`useTransform`), NOT the pointer: each
 * card is inert (`interactive="none"`) so the only motion is the scroll lean,
 * which keeps the composition calm.
 *
 * The lean amplitudes are deliberately small — fractions of `motion.tilt.maxDeg`
 * and `parallaxPx`, capped at a third of the max — so the collage reads as a
 * living spread, not a carousel. Only transforms animate, and every card's 4:5
 * box reserves its space, so the embed contributes zero layout shift. Reduced
 * motion holds the cards flat.
 */

// Cap the scroll lean at a third of the pointer-tilt max, per the plan — well
// below the interactive ceiling so a composed read stays gentle.
const TILT_FRACTION = 1 / 3;
const MAX_TILT = motionToken.tilt.maxDeg * TILT_FRACTION;
const MAX_PARALLAX = motionToken.tilt.parallaxPx * TILT_FRACTION;

// The four collage cards: shipped cutouts, each with a small resting offset so
// the spread reads as hand-placed, and a per-card lean direction/scale so they
// don't move in lockstep. `depth` scales the scroll-driven lean.
const CARDS: readonly {
  src: string;
  alt: string;
  offsetY: string;
  rotateDir: number;
  depth: number;
}[] = [
  { src: '/design-lab/cutouts/top.png', alt: 'A top from your closet', offsetY: 'var(--space-6)', rotateDir: -1, depth: 1 },
  { src: '/design-lab/cutouts/bottom.png', alt: 'Trousers from your closet', offsetY: '0px', rotateDir: 1, depth: 0.7 },
  { src: '/design-lab/cutouts/outerwear.png', alt: 'Outerwear from your closet', offsetY: 'var(--space-8)', rotateDir: 1, depth: 1.2 },
  { src: '/design-lab/cutouts/shoes.png', alt: 'Shoes from your closet', offsetY: 'var(--space-4)', rotateDir: -1, depth: 0.85 },
];

const gridStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(0, 1fr))',
  gap: 'var(--space-6)',
  // Reserve a comfortable maximum so the collage centers on wide screens without
  // the cards ballooning — each card keeps its own 4:5 box.
  maxWidth: 'var(--content-max)',
  perspective: 'var(--content-max)',
};

const cardWrapStyle: CSSProperties = {
  transformStyle: 'preserve-3d',
  willChange: 'transform',
};

/** One collage card, its lean derived from the section's scroll progress. */
function ClosetCard({
  progress,
  card,
  reduced,
}: {
  progress: MotionValue<number>;
  card: (typeof CARDS)[number];
  reduced: boolean;
}) {
  // Progress runs 0→1 as the section crosses the viewport; map it to a small
  // symmetric lean (−max → +max) scaled per-card, so cards settle level near the
  // section's center and lean at the entry/exit edges.
  const rotate = useTransform(
    progress,
    [0, 0.5, 1],
    [MAX_TILT * card.rotateDir * card.depth, 0, -MAX_TILT * card.rotateDir * card.depth],
  );
  const translateY = useTransform(
    progress,
    [0, 1],
    [MAX_PARALLAX * card.depth, -MAX_PARALLAX * card.depth],
  );

  return (
    <motion.div
      style={{
        ...cardWrapStyle,
        marginTop: card.offsetY,
        ...(reduced ? {} : { rotate, y: translateY }),
      }}
    >
      <ItemSurface src={card.src} alt={card.alt} interactive="none" />
    </motion.div>
  );
}

export function ClosetShowcase() {
  const reduced = useReducedMotion() ?? false;
  const ref = useRef<HTMLDivElement>(null);
  // Track this section's travel through the viewport: 0 as it enters at the
  // bottom, 1 as it leaves at the top.
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ['start end', 'end start'],
  });

  return (
    <div ref={ref} style={gridStyle}>
      {CARDS.map((card) => (
        <ClosetCard key={card.src} progress={scrollYProgress} card={card} reduced={reduced} />
      ))}
    </div>
  );
}
