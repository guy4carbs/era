'use client';

import { type CSSProperties } from 'react';
import Link from 'next/link';
import { strings } from '@era/core/strings';
import { eraAuth, useSession } from '../../../lib/auth-client';
import { TodayCard } from '../../../components/ovi';
import { NotificationFeed } from '../../../components/shop';
import { FeedList } from '../../../components/feed';
import { Button } from '../../../components/Button';
import { PageHeader } from '../../../components/PageHeader';
import { Text } from '../../../components/Text';

const screenStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  paddingBlock: 'var(--space-8)',
};

// The gapped section stack beneath the header: sections open on the 52px D6
// section rhythm. The header owns its own 32px air below (its marginBottom), so
// it sits OUTSIDE this stack.
const sectionsStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--rhythm-section-above)',
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
        <Link href="/sign-in" style={{ textDecoration: 'none' }}>
          <Text variant="ui" as="span" style={{ color: 'var(--color-accent)' }}>
            Sign in →
          </Text>
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
      <Button
        variant="secondary"
        onClick={() => {
          void eraAuth.signOut();
        }}
      >
        Sign out
      </Button>
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
      <PageHeader title="Feed" subtitle={strings.feed.subtitle} />
      <div style={sectionsStyle}>
        <SessionHeader />
        <TodayCard />
        <NotificationFeed />
        {feedEnabled ? <FeedList /> : <Text variant="body" style={emptyStyle}>{strings.feed.empty}</Text>}
      </div>
    </main>
  );
}
