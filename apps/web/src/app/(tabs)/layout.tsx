'use client';

import { type ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { motion, useReducedMotion } from 'motion/react';
import { motion as motionToken } from '@era/tokens';
import { Container, NavRail, OviFab } from '../../components';
import { OviChatProvider, useOviChat } from '../../components/ovi';
import { AnalyticsIdentity } from '../../components/system/AnalyticsIdentity';
import { transitionFor } from '../../lib/motion';

/**
 * True when the browser lacks the View Transitions API, so the keyed page-
 * enter fallback should run. When VT *is* available, the CSS in globals.css
 * owns the cross-fade and this fallback stays off (never double-animate).
 */
function needsPageEnterFallback(): boolean {
  return typeof document !== 'undefined' && document.startViewTransition === undefined;
}

/**
 * The tab shell body. Split out from the layout so it sits inside
 * {@link OviChatProvider} and the FAB can summon the chat sheet via
 * {@link useOviChat}.
 *
 * Navigation is the rail, at every width (user decree 2026-07-19): the web app
 * carries NO floating tab bar — the pill is a native-app gesture. The rail owns
 * tab switches (View-Transition-wrapped inside NavRail).
 */
function TabsShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const reduced = useReducedMotion();
  const { openChat, isOpen } = useOviChat();

  const content = <Container>{children}</Container>;

  return (
    <div className="era-tabs-shell">
      {/* Binds analytics identity to the session so funnel events attribute to the user. */}
      <AnalyticsIdentity />
      <NavRail />

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
