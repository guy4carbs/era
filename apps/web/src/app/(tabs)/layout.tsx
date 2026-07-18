'use client';

import { type CSSProperties, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Container, OviFab, TabBar, TAB_ITEMS, type TabId } from '../../components';
import { OviChatProvider, useOviChat } from '../../components/ovi';
import { AnalyticsIdentity } from '../../components/system/AnalyticsIdentity';
import { Text } from '../../components/Text';

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
  textDecoration: 'none',
};

/**
 * The tab shell body. Split out from the layout so it sits inside
 * {@link OviChatProvider} and the FAB can summon the chat sheet via
 * {@link useOviChat}.
 */
function TabsShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const active = activeTabFrom(pathname);
  const { openChat, isOpen } = useOviChat();

  return (
    <div className="era-tabs-shell">
      {/* Binds analytics identity to the session so funnel events attribute to the user. */}
      <AnalyticsIdentity />
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
              <Text variant="ui">{tab.label}</Text>
            </Link>
          );
        })}
      </nav>

      <Container>{children}</Container>

      <TabBar active={active} onChange={(id) => router.push(`/${id}`)} />
      {isOpen ? null : <OviFab onClick={() => openChat()} />}
    </div>
  );
}

export default function TabsLayout({ children }: { children: ReactNode }) {
  return (
    <OviChatProvider>
      <TabsShell>{children}</TabsShell>
    </OviChatProvider>
  );
}
