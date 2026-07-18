'use client';

import { type CSSProperties, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { motion, useReducedMotion } from 'motion/react';
import { motion as motionToken } from '@era/tokens';
import { Container, OviFab, TabBar, TAB_ITEMS, type TabId } from '../../components';
import { OviChatProvider, useOviChat } from '../../components/ovi';
import { AnalyticsIdentity } from '../../components/system/AnalyticsIdentity';
import { Text } from '../../components/Text';
import { pressProps, transitionFor, viewTransition } from '../../lib/motion';

/** Press-enabled rail link — Link with the token tap affordance. */
const MotionLink = motion.create(Link);

/**
 * True when the browser lacks the View Transitions API, so the keyed page-
 * enter fallback should run. When VT *is* available, the CSS in globals.css
 * owns the cross-fade and this fallback stays off (never double-animate).
 */
function needsPageEnterFallback(): boolean {
  return typeof document !== 'undefined' && document.startViewTransition === undefined;
}

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
  const reduced = useReducedMotion();
  const active = activeTabFrom(pathname);
  const { openChat, isOpen } = useOviChat();

  // Tab switches route through the View Transitions API for a cross-fade + rise
  // (styled in globals.css). It degrades to a plain push where VT / motion is
  // unavailable — see viewTransition.
  const navigate = (id: TabId) => viewTransition(() => router.push(`/${id}`));

  const content = <Container>{children}</Container>;

  return (
    <div className="era-tabs-shell">
      {/* Binds analytics identity to the session so funnel events attribute to the user. */}
      <AnalyticsIdentity />
      <nav className="era-rail" style={railStyle} aria-label="Primary">
        {TAB_ITEMS.map((tab) => {
          const isActive = tab.id === active;
          return (
            <MotionLink
              key={tab.id}
              href={`/${tab.id}`}
              aria-current={isActive ? 'page' : undefined}
              onClick={(e) => {
                // Intercept so the route change runs through the view transition
                // rather than Link's default (untransitioned) navigation.
                e.preventDefault();
                navigate(tab.id);
              }}
              style={{
                ...railItemStyle,
                color: isActive ? 'var(--color-accent)' : 'var(--color-secondary-strong)',
              }}
              {...pressProps(reduced)}
            >
              <Text variant="ui">{tab.label}</Text>
            </MotionLink>
          );
        })}
      </nav>

      {needsPageEnterFallback() ? (
        <motion.div
          key={pathname}
          initial={reduced ? { opacity: 0 } : { opacity: 0, y: motionToken.pageRise.yPx }}
          animate={reduced ? { opacity: 1 } : { opacity: 1, y: 0 }}
          transition={transitionFor(motionToken.springs.gentle, reduced)}
        >
          {content}
        </motion.div>
      ) : (
        content
      )}

      <TabBar active={active} onChange={navigate} />
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
