'use client';

import { useEffect, useState, type CSSProperties } from 'react';
import Link from 'next/link';
import { motion, useReducedMotion } from 'motion/react';
import { strings } from '@era/core/strings';
import { Collage } from '../design/Collage';
import type { OutfitSummary } from '../design/types';
import { Text } from '../Text';
import { pressProps } from '../../lib/motion';
import { useSession } from '../../lib/auth-client';

/** Newest-first cap — a morning page shows a handful, not the whole archive. */
const RECENT_CAP = 6;

/**
 * "Recent looks" — the editorial row of the solo morning page. Below the ritual,
 * it shows the user's most recent composed outfits as Item-Engine-grammar cards
 * (the {@link Collage} cover, or a 2×2 of member thumbnails when there's no
 * cover), each linking back to its outfit on the canvas — the same open path the
 * Design tab uses (`/design/canvas?outfit={id}`).
 *
 * The morning page stays quiet: while loading, or when the user owns no outfits,
 * this renders NOTHING — no heading, no empty text. The row (label + hairline
 * rule) only appears once there's at least one look to show.
 */
export function RecentLooks() {
  const { data: session, isPending } = useSession();
  const [outfits, setOutfits] = useState<OutfitSummary[] | null>(null);
  const reduced = useReducedMotion();

  useEffect(() => {
    if (isPending || !session) return;
    let active = true;
    void (async () => {
      try {
        const res = await fetch('/api/outfits');
        if (!res.ok) throw new Error('outfits fetch failed');
        const body = (await res.json()) as { outfits: OutfitSummary[] };
        if (active) setOutfits(body.outfits);
      } catch {
        // A failed fetch leaves the row silent — never empty chrome.
        if (active) setOutfits([]);
      }
    })();
    return () => {
      active = false;
    };
  }, [isPending, session]);

  // Silent until there's something to show: no label, no rule, no empty line.
  if (!outfits || outfits.length === 0) return null;

  const looks = outfits.slice(0, RECENT_CAP);

  return (
    <section style={sectionStyle} aria-label={strings.feed.recentLooks}>
      {/* Editorial section label: Fraunces Italic (oviAccent) then a hairline rule
          filling the row — the same treatment the closet sections use. */}
      <div style={sectionHeadingStyle}>
        <Text variant="oviAccent" as="h2" style={{ margin: 0 }}>
          {strings.feed.recentLooks}
        </Text>
        <span aria-hidden="true" style={hairlineStyle} />
      </div>

      <div style={rowStyle}>
        {looks.map((outfit) => {
          const title = outfit.name ?? strings.design.newOutfit;
          const meta = strings.design.outfitItemCount(outfit.itemCount);
          return (
            <div key={outfit.id} style={cardStyle}>
              <MotionLinkCard href={`/design/canvas?outfit=${outfit.id}`} label={title} reduced={reduced ?? false}>
                <Collage cover={outfit.coverUrl} thumbs={outfit.thumbnailUrls} alt={title} />
              </MotionLinkCard>
              {/* The look's name reads as an editorial label — Fraunces italic
                  (oviAccent), matching the Design grid's outfit cards. */}
              <Text
                variant="oviAccent"
                size="subhead"
                as="p"
                style={nameStyle}
              >
                {title}
              </Text>
              <Text variant="caption" size="footnote" as="p" style={metaStyle}>
                {meta}
              </Text>
            </div>
          );
        })}
      </div>
    </section>
  );
}

/** next/link routed through motion so each look card gets the press affordance. */
const MotionLink = motion.create(Link);

function MotionLinkCard({
  href,
  label,
  reduced,
  children,
}: {
  href: string;
  label: string;
  reduced: boolean;
  children: React.ReactNode;
}) {
  return (
    <MotionLink href={href} aria-label={label} style={linkStyle} {...pressProps(reduced)}>
      {children}
    </MotionLink>
  );
}

const sectionStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-4)',
};

// Editorial section heading: the italic serif label sits left, a hairline rule
// fills the rest of the row, both vertically centred with a --space-3 gap.
const sectionHeadingStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 'var(--space-3)',
};

const hairlineStyle: CSSProperties = {
  flex: 1,
  height: 'var(--glass-border-width)',
  background: 'var(--color-hairline)',
};

// A horizontal row of look cards that wraps to a 2-col layout at narrow widths:
// each card is a fixed fraction of the feed column so the row scans as a strip.
const rowStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
  gap: 'var(--space-4)',
};

const cardStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-2)',
  minWidth: 0,
};

const linkStyle: CSSProperties = {
  display: 'block',
  width: '100%',
  textDecoration: 'none',
  color: 'var(--color-text)',
};

const nameStyle: CSSProperties = {
  margin: 0,
  color: 'var(--color-text)',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
};

const metaStyle: CSSProperties = {
  margin: 0,
  color: 'var(--color-secondary-strong)',
};
