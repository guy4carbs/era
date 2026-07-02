'use client';

import { type CSSProperties, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { typeRamp } from '@era/tokens';
import { Container, OviFab, TabBar, TAB_ITEMS, type TabId } from '../../components';

/** Resolve the active tab from the first path segment; default to feed. */
function activeTabFrom(pathname: string): TabId {
  const segment = pathname.split('/')[1];
  return TAB_ITEMS.find((tab) => tab.id === segment)?.id ?? 'feed';
}

// Fixed desktop rail. `display` is intentionally omitted here — the generated
// `.era-rail` rule owns it (none below lg, flex at/above), so this inline style
// must not override the toggle. Flex properties stay inert until the class turns
// display on.
const railStyle: CSSProperties = {
  position: 'fixed',
  top: 0,
  left: 0,
  bottom: 0,
  width: 'var(--rail-width)',
  flexDirection: 'column',
  gap: 'var(--space-2)',
  paddingTop: 'var(--space-8)',
  paddingInline: 'var(--space-2)',
  borderRight: 'var(--glass-border-width) solid var(--color-hairline)',
  background: 'var(--color-bg)',
  zIndex: 40,
};

const railItemStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  minHeight: 'var(--touch-target-min)',
  paddingInline: 'var(--space-2)',
  borderRadius: 'var(--radius-chip)',
  fontSize: typeRamp.subhead.rem,
  lineHeight: `${typeRamp.subhead.lineHeight}px`,
  fontWeight: 600,
  textDecoration: 'none',
};

export default function TabsLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const active = activeTabFrom(pathname);

  return (
    <div className="era-tabs-shell">
      <nav className="era-rail" style={railStyle} aria-label="Primary">
        {TAB_ITEMS.map((tab) => {
          const isActive = tab.id === active;
          return (
            <Link
              key={tab.id}
              href={`/${tab.id}`}
              aria-current={isActive ? 'page' : undefined}
              style={{
                ...railItemStyle,
                color: isActive ? 'var(--color-accent)' : 'var(--color-secondary-strong)',
              }}
            >
              {tab.label}
            </Link>
          );
        })}
      </nav>

      <Container>{children}</Container>

      <TabBar active={active} onChange={(id) => router.push(`/${id}`)} />
      <OviFab
        onClick={() => {
          // TODO(Phase 1): open the Ovi chat sheet. No-op until that lands.
        }}
      />
    </div>
  );
}
