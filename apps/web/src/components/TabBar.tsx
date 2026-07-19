'use client';

import { type CSSProperties } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { pressProps } from '../lib/motion';
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

const barStyle: CSSProperties = {
  ...glassSurfaceStyle(),
  position: 'fixed',
  left: 0,
  right: 0,
  bottom: 0,
  // Bar height plus the device's home-indicator inset.
  height: 'calc(var(--tabbar-height) + env(safe-area-inset-bottom))',
  paddingBottom: 'env(safe-area-inset-bottom)',
  alignItems: 'stretch',
  // Frame only the top edge; drop the recipe's all-sides border, shadow and
  // radius. The §3 top border replaces the old `--color-hairline` for
  // consistency with every other glass surface.
  border: undefined,
  boxShadow: undefined,
  borderRadius: undefined,
  borderTop: 'var(--glass-border-width) solid var(--glass-border)',
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

/**
 * Bottom glass tab bar for the phone/tablet viewport. Generated CSS
 * (`.era-tabbar`) hides it at/above the lg breakpoint, where the desktop left
 * rail takes over as primary navigation.
 */
export function TabBar({ active, onChange }: TabBarProps) {
  const reduced = useReducedMotion();
  return (
    <nav className="era-tabbar" style={barStyle} aria-label="Primary">
      {TAB_ITEMS.map((tab) => {
        const isActive = tab.id === active;
        return (
          <motion.button
            key={tab.id}
            type="button"
            style={{ ...tabStyle, color: isActive ? 'var(--color-accent)' : 'var(--color-secondary-strong)' }}
            aria-label={tab.label}
            aria-current={isActive ? 'page' : undefined}
            onClick={() => onChange(tab.id)}
            {...pressProps(reduced)}
          >
            <Text variant="ui">{tab.label}</Text>
          </motion.button>
        );
      })}
    </nav>
  );
}
