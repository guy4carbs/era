'use client';

import { useRef, type CSSProperties } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { motion as motionToken } from '@era/tokens';
import { transitionFor } from '../lib/motion';
import { Text } from './Text';

export interface PageHeaderProps {
  /** The page title — rendered as the serif largeTitle h1. */
  title: string;
  /**
   * One calm line beneath the title. Body role (Geist, 17px) at
   * `--color-secondary` — legal only at the ≥17pt tier this role sits in.
   */
  subtitle: string;
}

/**
 * The page header shared by every top-level screen (D6 spatial rhythm).
 *
 * The title is the serif `largeTitle` h1; the subtitle is a single `body` line
 * at `--color-secondary`. Both rise into place on route entry — the title on the
 * gentle spring, the subtitle the same rise delayed by
 * `motion.headerRise.subtitleDelayMs` (60ms) so it settles a beat later.
 *
 * The component owns the header→first-section air via `marginBottom`
 * (`--rhythm-header-below`, 32px), so a screen places `<PageHeader>` and then a
 * gapped stack of sections beneath it (the 52px section rhythm coming from that
 * stack's gap, not from here).
 *
 * The entrance replays whenever the component mounts (each route mounts a fresh
 * one — the natural per-page replay). A mount guard stops it re-firing on client
 * re-renders in place: after first paint the variants are dropped so a state
 * change never re-runs the rise. Under reduced motion both lines collapse to the
 * standard 150ms fade, simultaneous — no rise, no stagger delay.
 */
export function PageHeader({ title, subtitle }: PageHeaderProps) {
  const reduced = useReducedMotion();
  // Mount guard: the rise animates on the FIRST render only. Subsequent client
  // re-renders (a parent state change) must not replay it — mirrors ClosetGallery.
  const didMount = useRef(false);
  const animateOnMount = !didMount.current;
  didMount.current = true;

  const rise = reduced ? { opacity: 0 } : { opacity: 0, y: motionToken.headerRise.yPx };
  const settle = reduced ? { opacity: 1 } : { opacity: 1, y: 0 };

  const titleTransition = transitionFor(motionToken.springs.gentle, reduced);
  // The subtitle follows on a small delay so it lands after the title — dropped
  // under reduced motion (the fade is simultaneous there).
  const subtitleTransition = reduced
    ? titleTransition
    : { ...titleTransition, delay: motionToken.headerRise.subtitleDelayMs / 1000 };

  return (
    <header style={headerStyle}>
      <motion.div
        initial={animateOnMount ? rise : false}
        animate={animateOnMount ? settle : undefined}
        transition={titleTransition}
      >
        <Text variant="largeTitle" as="h1" style={titleStyle}>
          {title}
        </Text>
      </motion.div>
      <motion.div
        initial={animateOnMount ? rise : false}
        animate={animateOnMount ? settle : undefined}
        transition={subtitleTransition}
      >
        <Text variant="body" as="p" style={subtitleStyle}>
          {subtitle}
        </Text>
      </motion.div>
    </header>
  );
}

const headerStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-1)',
  // The header owns its own air below (32px), so a screen's section stack sits
  // outside this margin and opens its own 52px rhythm above the first section.
  marginBottom: 'var(--rhythm-header-below)',
};

const titleStyle: CSSProperties = {
  margin: 0,
};

const subtitleStyle: CSSProperties = {
  margin: 0,
  color: 'var(--color-secondary)',
};
