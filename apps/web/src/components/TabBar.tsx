'use client';

import { type CSSProperties } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { glow, layout, motion as motionToken, spacing } from '@era/tokens';
import { glowShadow } from '../lib/glow';
import { useTheme } from '../lib/theme';
import { pressProps, transitionFor } from '../lib/motion';
import { useScrollDirection } from '../lib/use-scroll-direction';
import { glassSurfaceStyle } from './GlassPanel';
import { Text } from './Text';

export type TabId = 'feed' | 'closet' | 'design' | 'shop';

export interface TabDef {
  id: TabId;
  label: string;
}

/**
 * The four primary destinations, in order. Exported so the desktop left rail
 * (see the (tabs) group layout) renders the same set from one source.
 */
export const TAB_ITEMS: readonly TabDef[] = [
  { id: 'feed', label: 'Feed' },
  { id: 'closet', label: 'Closet' },
  { id: 'design', label: 'Design' },
  { id: 'shop', label: 'Shop' },
];

export interface TabBarProps {
  active: TabId;
  onChange: (id: TabId) => void;
}

// How far the pill travels off-screen when hidden: bar height + its bottom lift
// + a generous allowance that clears any device home-indicator inset. Computed
// from tokens (motion targets can't interpolate a calc() with env()).
const HIDDEN_Y = layout.tabBarHeight + spacing.s3 + spacing.s16;

// Floating glass pill: inset horizontally, lifted off the bottom, fully rounded.
// The border here is part of the D0.4 glass recipe (allowed), not a stray hairline.
const barStyle: CSSProperties = {
  ...glassSurfaceStyle({ radius: 'var(--radius-full)' }),
  position: 'fixed',
  left: 'var(--space-4)',
  right: 'var(--space-4)',
  bottom: 'calc(var(--space-3) + env(safe-area-inset-bottom))',
  height: 'var(--tabbar-height)',
  display: 'flex',
  alignItems: 'stretch',
  zIndex: 40,
};

const tabStyle: CSSProperties = {
  flex: 1,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 'var(--space-1)',
  minHeight: 'var(--touch-target-min)',
  background: 'transparent',
  border: 'none',
  cursor: 'pointer',
};

const dotSlotStyle: CSSProperties = {
  width: 'var(--rail-dot)',
  height: 'var(--rail-dot)',
  display: 'inline-flex',
};

const dotStyle: CSSProperties = {
  width: 'var(--rail-dot)',
  height: 'var(--rail-dot)',
  borderRadius: 'var(--radius-full)',
  background: 'var(--color-accent)',
};

/**
 * Bottom glass tab bar for the phone/tablet viewport. Generated CSS
 * (`.era-tabbar`) hides it at/above the lg breakpoint, where the desktop left
 * rail takes over as primary navigation.
 *
 * The pill hides on scroll-down and returns on scroll-up (reading affordance):
 * it slides off-screen on the gentle spring, or fades under reduced motion.
 */
export function TabBar({ active, onChange }: TabBarProps) {
  const reduced = useReducedMotion();
  const { resolved } = useTheme();
  const shown = useScrollDirection();

  // Active dot glows at the mode's base opacity — the same brand gesture as the
  // rail's dot.
  const dotShadow = glowShadow(glow.opacity[resolved]);

  return (
    <motion.nav
      className="era-tabbar"
      style={barStyle}
      aria-label="Primary"
      initial={false}
      animate={
        reduced
          ? { opacity: shown ? 1 : 0, pointerEvents: shown ? 'auto' : 'none' }
          : { y: shown ? 0 : HIDDEN_Y, opacity: 1, pointerEvents: shown ? 'auto' : 'none' }
      }
      transition={transitionFor(motionToken.springs.gentle, reduced)}
    >
      {TAB_ITEMS.map((tab) => {
        const isActive = tab.id === active;
        return (
          <motion.button
            key={tab.id}
            type="button"
            style={{
              ...tabStyle,
              color: isActive ? 'var(--color-text)' : 'var(--color-secondary-strong)',
            }}
            aria-label={tab.label}
            aria-current={isActive ? 'page' : undefined}
            onClick={() => onChange(tab.id)}
            {...pressProps(reduced)}
          >
            <Text variant="ui">{tab.label}</Text>
            <span style={dotSlotStyle}>
              {isActive ? (
                <span style={{ ...dotStyle, boxShadow: dotShadow }} aria-hidden="true" />
              ) : null}
            </span>
          </motion.button>
        );
      })}
    </motion.nav>
  );
}
