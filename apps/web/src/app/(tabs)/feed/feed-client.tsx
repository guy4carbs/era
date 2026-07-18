'use client';

import { type CSSProperties } from 'react';
import Link from 'next/link';
import { strings } from '@era/core/strings';
import { eraAuth, useSession } from '../../../lib/auth-client';
import { TodayCard } from '../../../components/ovi';
import { NotificationFeed } from '../../../components/shop';
import { FeedList } from '../../../components/feed';
import { Text } from '../../../components/Text';

const screenStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-6)',
  paddingBlock: 'var(--space-8)',
};

// Screen title — serif largeTitle role at the title1 step (matches mobile feed).
const titleStyle: CSSProperties = {
  margin: 0,
};

const emptyStyle: CSSProperties = {
  margin: 0,
  color: 'var(--color-secondary)',
};

const sessionRowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 'var(--space-4)',
  minHeight: 'var(--touch-target-min)',
};

/** Session-aware greeting + auth affordance, carried over from the old home. */
function SessionHeader() {
  const { data: session, isPending } = useSession();

  if (isPending) {
    return <div style={{ ...sessionRowStyle, color: 'var(--color-secondary)' }}>Loading…</div>;
  }

  if (!session) {
    return (
      <div style={sessionRowStyle}>
        <Text variant="caption" style={{ color: 'var(--color-secondary)' }}>
          Your wardrobe, reimagined.
        </Text>
        <Link className="link" href="/sign-in">
          Sign in →
        </Link>
      </div>
    );
  }

  const { user } = session;
  const greeting = user.name.trim().length > 0 ? user.name : user.email;

  return (
    <div style={sessionRowStyle}>
      <Text variant="body" style={{ color: 'var(--color-secondary)' }}>
        Hi {greeting}
      </Text>
      <button
        type="button"
        className="btn btn-secondary"
        onClick={() => {
          void eraAuth.signOut();
        }}
      >
        Sign out
      </button>
    </div>
  );
}

/**
 * The feed tab's client body. `feedEnabled` arrives as a prop from the server
 * `page.tsx`, which reads the AUTHORITATIVE `ERA_FEED_ENABLED` at request time —
 * never a `NEXT_PUBLIC_*` var here. NEXT_PUBLIC values are inlined into the
 * client bundle at BUILD time, so a flag flipped on Railway after the image was
 * built silently stays off (the exact class of bug that bit /plus and the
 * sitemap; observed again on this page in prod 2026-07-14).
 */
export function FeedScreen({ feedEnabled }: { feedEnabled: boolean }) {
  return (
    <main style={screenStyle}>
      <SessionHeader />
      <TodayCard />
      <NotificationFeed />
      <Text variant="largeTitle" as="h1" size="title1" style={titleStyle}>Feed</Text>
      {feedEnabled ? <FeedList /> : <Text variant="body" style={emptyStyle}>{strings.feed.empty}</Text>}
    </main>
  );
}
