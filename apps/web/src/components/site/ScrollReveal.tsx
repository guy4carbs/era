'use client';

import { useRef, type CSSProperties, type ReactNode } from 'react';
import { motion, useInView, useReducedMotion } from 'motion/react';
import { motion as motionToken, spacing } from '@era/tokens';
import { transitionFor } from '../../lib/motion';

export interface ScrollRevealProps {
  children: ReactNode;
  style?: CSSProperties;
}

/** Rise distance for the reveal — a spacing-scale step (px), not a literal. */
const RISE_PX = spacing.s6;

/**
 * Scroll-triggered reveal: fades and rises its children into place the first
 * time they enter the viewport (IntersectionObserver, via Framer's
 * {@link useInView}). Under reduced motion it renders the children statically —
 * no observer, no transform, no fade — so content is instant and never risks
 * staying hidden if an observer callback misses.
 */
export function ScrollReveal({ children, style }: ScrollRevealProps) {
  const reduced = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  // `once` — reveal a single time; `amount` — fire when ~a quarter is visible.
  const inView = useInView(ref, { once: true, amount: 0.25 });

  if (reduced) {
    return <div style={style}>{children}</div>;
  }

  return (
    <motion.div
      ref={ref}
      style={style}
      initial={{ opacity: 0, y: RISE_PX }}
      animate={inView ? { opacity: 1, y: 0 } : { opacity: 0, y: RISE_PX }}
      transition={transitionFor(motionToken.springs.gentle, reduced)}
    >
      {children}
    </motion.div>
  );
}
