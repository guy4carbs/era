'use client';

import { type CSSProperties } from 'react';
import { layout, typeRamp } from '@era/tokens';
import { strings } from '@era/core/strings';
import { Collage } from './Collage';
import type { OutfitSummary } from './types';

export interface OutfitGridProps {
  outfits: OutfitSummary[];
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

const nameStyle: CSSProperties = {
  margin: 0,
  fontSize: typeRamp.subhead.rem,
  lineHeight: `${typeRamp.subhead.lineHeight}px`,
  fontWeight: 600,
  color: 'var(--color-text)',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
};

const metaStyle: CSSProperties = {
  margin: 0,
  fontSize: typeRamp.footnote.rem,
  color: 'var(--color-secondary-strong)',
};

const assignStyle: CSSProperties = {
  alignSelf: 'flex-start',
  padding: 0,
  border: 'none',
  background: 'transparent',
  color: 'var(--color-accent)',
  fontSize: typeRamp.footnote.rem,
  fontWeight: 600,
  cursor: 'pointer',
};

/**
 * The saved-outfits grid. Each card is its cover collage (tap to reopen on the
 * canvas), the outfit name + occasion + piece count, and an inline "add to an
 * era" action.
 */
export function OutfitGrid({ outfits, onOpen, onAssign }: OutfitGridProps) {
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
            <p style={nameStyle}>{title}</p>
            <p style={metaStyle}>{meta}</p>
            <button type="button" style={assignStyle} onClick={() => onAssign(outfit)}>
              {strings.design.assignToEra}
            </button>
          </div>
        );
      })}
    </div>
  );
}
