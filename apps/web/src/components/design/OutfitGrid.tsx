'use client';

import { type CSSProperties } from 'react';
import { layout } from '@era/tokens';
import { Text } from '../Text';
import { strings } from '@era/core/strings';
import { ShareToFeedButton } from '../feed';
import { Collage } from './Collage';
import type { OutfitSummary } from './types';

export interface OutfitGridProps {
  outfits: OutfitSummary[];
  /** Server-read feed flag (request time) — gates the share-to-feed button. */
  feedEnabled: boolean;
  onOpen: (id: string) => void;
  onAssign: (outfit: OutfitSummary) => void;
}

const gridCss = [
  `.era-outfit-grid{display:grid;gap:${layout.grid.gutter}px;grid-template-columns:repeat(2,minmax(0,1fr))}`,
  `@media(min-width:${layout.breakpoints.md}px){.era-outfit-grid{grid-template-columns:repeat(3,minmax(0,1fr))}}`,
  `@media(min-width:${layout.breakpoints.lg}px){.era-outfit-grid{grid-template-columns:repeat(4,minmax(0,1fr))}}`,
].join('\n');

const cardStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-2)',
};

const openButtonStyle: CSSProperties = {
  padding: 0,
  border: 'none',
  background: 'transparent',
  cursor: 'pointer',
  width: '100%',
};

const assignStyle: CSSProperties = {
  alignSelf: 'flex-start',
  padding: 0,
  border: 'none',
  background: 'transparent',
  cursor: 'pointer',
};

/**
 * The saved-outfits grid. Each card is its cover collage (tap to reopen on the
 * canvas), the outfit name + occasion + piece count, and an inline "add to an
 * era" action.
 */
export function OutfitGrid({ outfits, feedEnabled, onOpen, onAssign }: OutfitGridProps) {
  return (
    <div className="era-outfit-grid">
      <style>{gridCss}</style>
      {outfits.map((outfit) => {
        const title = outfit.name ?? strings.design.newOutfit;
        const meta = [outfit.occasion, strings.design.outfitItemCount(outfit.itemCount)]
          .filter((part): part is string => Boolean(part))
          .join(' · ');
        return (
          <div key={outfit.id} style={cardStyle}>
            <button type="button" style={openButtonStyle} aria-label={title} onClick={() => onOpen(outfit.id)}>
              <Collage cover={outfit.coverUrl} thumbs={outfit.thumbnailUrls} alt={title} />
            </button>
            <Text
              variant="ui"
              size="subhead"
              weight={600}
              as="p"
              style={{ margin: 0, color: 'var(--color-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
            >
              {title}
            </Text>
            <Text variant="caption" size="footnote" as="p" style={{ margin: 0, color: 'var(--color-secondary-strong)' }}>
              {meta}
            </Text>
            <button type="button" style={assignStyle} onClick={() => onAssign(outfit)}>
              <Text variant="ui" size="footnote" weight={600} style={{ color: 'var(--color-accent)' }}>
                {strings.design.assignToEra}
              </Text>
            </button>
            {/* Flag-gated (renders null when the feed is off) — the web outfit
                share entry point, matching the inline "add to an era" idiom.
                Seeded so an already-shared outfit reads as shared after a reload. */}
            <ShareToFeedButton
              enabled={feedEnabled}
              outfitId={outfit.id}
              initialSharedPostId={outfit.sharedPostId}
            />
          </div>
        );
      })}
    </div>
  );
}
