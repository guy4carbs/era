'use client';

import { type CSSProperties } from 'react';
import Link from 'next/link';
import { typeRamp } from '@era/tokens';
import { strings } from '@era/core/strings';
import { eraAuth, useSession } from '../../../lib/auth-client';
import { TodayCard } from '../../../components/ovi';
import { NotificationFeed } from '../../../components/shop';

const screenStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-6)',
  paddingBlock: 'var(--space-8)',
};

const titleStyle: CSSProperties = {
  margin: 0,
  fontSize: typeRamp.title1.rem,
  lineHeight: `${typeRamp.title1.lineHeight}px`,
  fontWeight: 700,
};

const emptyStyle: CSSProperties = {
  margin: 0,
  color: 'var(--color-secondary)',
  fontSize: typeRamp.body.rem,
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
        <span style={{ color: 'var(--color-secondary)', fontSize: typeRamp.footnote.rem }}>
          Your wardrobe, reimagined.
        </span>
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
      <span style={{ color: 'var(--color-secondary)', fontSize: typeRamp.footnote.rem }}>
        Hi {greeting}
      </span>
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

export default function FeedPage() {
  return (
    <main style={screenStyle}>
      <SessionHeader />
      <TodayCard />
      <NotificationFeed />
      <h1 style={titleStyle}>Feed</h1>
      <p style={emptyStyle}>{strings.feed.empty}</p>
    </main>
  );
}
