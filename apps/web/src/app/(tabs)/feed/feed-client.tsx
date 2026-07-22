'use client';

import { type CSSProperties } from 'react';
import { TodayCard } from '../../../components/ovi';
import { NotificationFeed } from '../../../components/shop';
import { FeedList, RecentLooks, FeedOviSuggestion } from '../../../components/feed';

const screenStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  paddingBlock: 'var(--space-8)',
};

// The section stack: sections open on the 52px D6 section rhythm. The ritual
// (TodayCard) leads the page and carries the heading role via its own 'Today'
// title — there is no PageHeader or greeting block above it (the spec kills
// "plain text blocks and default headings"). Everything below breathes on the
// same section rhythm.
const sectionsStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--rhythm-section-above)',
};

/**
 * The feed tab's client body. `feedEnabled` arrives as a prop from the server
 * `page.tsx`, which reads the AUTHORITATIVE `ERA_FEED_ENABLED` at request time —
 * never a `NEXT_PUBLIC_*` var here. NEXT_PUBLIC values are inlined into the
 * client bundle at BUILD time, so a flag flipped on Railway after the image was
 * built silently stays off (the exact class of bug that bit /plus and the
 * sitemap; observed again on this page in prod 2026-07-14).
 *
 * Solo mode (the flag OFF, the live surface) is a calm morning page: the ritual
 * opens it, a quiet 'Recent looks' row follows, then one Ovi suggestion, then the
 * Shop notifications — each section stays silent when it has nothing to show, so
 * the page never paints empty headings or placeholder text.
 */
export function FeedScreen({ feedEnabled }: { feedEnabled: boolean }) {
  return (
    <main style={screenStyle}>
      <div style={sectionsStyle}>
        {/* The ritual leads — its own 'Today' title carries the page heading. */}
        <TodayCard />
        {/* A quiet editorial row of the user's recent looks; renders nothing at
            zero outfits (the morning page stays quiet). */}
        <RecentLooks />
        {/* One ambient Ovi suggestion, sharing the Closet's dismissal key. */}
        <FeedOviSuggestion />
        {/* Shop price-drop / receipt notifications — self-gates to null when
            there's nothing unread, so it adds no empty chrome. */}
        <NotificationFeed />
        {/* The flagged public feed frame — only mounts behind ERA_FEED_ENABLED. */}
        {feedEnabled ? <FeedList /> : null}
      </div>
    </main>
  );
}
