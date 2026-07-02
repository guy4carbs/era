'use client';

import { type CSSProperties } from 'react';
import { typeRamp } from '@era/tokens';

export type TabId = 'feed' | 'closet' | 'design' | 'shop';

interface TabDef {
  id: TabId;
  label: string;
}

const TABS: readonly TabDef[] = [
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
  position: 'fixed',
  left: 0,
  right: 0,
  bottom: 0,
  // Bar height plus the device's home-indicator inset.
  height: 'calc(var(--tabbar-height) + env(safe-area-inset-bottom))',
  paddingBottom: 'env(safe-area-inset-bottom)',
  alignItems: 'stretch',
  background: `color-mix(in srgb, var(--color-surface) var(--glass-tint), transparent)`,
  backdropFilter: 'blur(var(--glass-blur))',
  WebkitBackdropFilter: 'blur(var(--glass-blur))',
  borderTop: 'var(--glass-border-width) solid var(--color-hairline)',
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
  fontSize: typeRamp.caption.rem,
  lineHeight: `${typeRamp.caption.lineHeight}px`,
  fontWeight: 600,
};

/**
 * Bottom glass tab bar for the mobile viewport. Generated CSS (`.era-tabbar`)
 * hides it at/above the md breakpoint, mirroring the native iOS chrome above
 * that width.
 */
export function TabBar({ active, onChange }: TabBarProps) {
  return (
    <nav className="era-tabbar" style={barStyle} aria-label="Primary">
      {TABS.map((tab) => {
        const isActive = tab.id === active;
        return (
          <button
            key={tab.id}
            type="button"
            style={{ ...tabStyle, color: isActive ? 'var(--color-accent)' : 'var(--color-secondary-strong)' }}
            aria-label={tab.label}
            aria-current={isActive ? 'page' : undefined}
            onClick={() => onChange(tab.id)}
          >
            {tab.label}
          </button>
        );
      })}
    </nav>
  );
}
