'use client';

import { useState, type CSSProperties } from 'react';
import { layout, typeRamp } from '@era/tokens';
import { strings } from '@era/core/strings';
import { Input } from '../Input';
import { Button } from '../Button';
import { ShareToFeedButton } from '../feed';
import { Collage } from './Collage';
import { ERA_DESCRIPTION_MAX, ERA_TITLE_MAX } from './constants';
import type { EraSummary } from './types';

export interface EraListProps {
  eras: EraSummary[];
  creating: boolean;
  /** Server-read feed flag (request time) — gates the share-to-feed button. */
  feedEnabled: boolean;
  onCreate: (title: string, description: string) => void;
}

const gridCss = [
  `.era-era-grid{display:grid;gap:${layout.grid.gutter}px;grid-template-columns:repeat(2,minmax(0,1fr))}`,
  `@media(min-width:${layout.breakpoints.md}px){.era-era-grid{grid-template-columns:repeat(3,minmax(0,1fr))}}`,
].join('\n');

const sectionStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-4)',
};

const headingStyle: CSSProperties = {
  margin: 0,
  fontSize: typeRamp.title2.rem,
  lineHeight: `${typeRamp.title2.lineHeight}px`,
  fontWeight: 700,
};

const cardStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-2)',
};

const titleStyle: CSSProperties = {
  margin: 0,
  fontSize: typeRamp.subhead.rem,
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

const formStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-3)',
  paddingTop: 'var(--space-2)',
};

/** Plural "outfit(s)" count for an era card. */
function outfitCountLabel(n: number): string {
  return `${n} ${n === 1 ? 'outfit' : 'outfits'}`;
}

/**
 * The eras section on the Design tab: a heading, a grid of era cards (cover
 * collage + title + outfit count), and an inline "start an era" form. Creating
 * an era refreshes the list through the parent.
 */
export function EraList({ eras, creating, feedEnabled, onCreate }: EraListProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');

  function submit() {
    const trimmed = title.trim();
    if (trimmed.length === 0) return;
    onCreate(trimmed, description.trim());
    setTitle('');
    setDescription('');
  }

  return (
    <section style={sectionStyle}>
      <style>{gridCss}</style>
      <h2 style={headingStyle}>{strings.design.eraSectionTitle}</h2>

      {eras.length > 0 ? (
        <div className="era-era-grid">
          {eras.map((era) => (
            <div key={era.id} style={cardStyle}>
              <Collage cover={era.coverUrl} thumbs={era.outfitCovers} alt={era.title} />
              <p style={titleStyle}>{era.title}</p>
              <p style={metaStyle}>{outfitCountLabel(era.outfitCount)}</p>
              {/* Flag-gated (renders null when the feed is off) — the ONLY web
                  era-share surface this phase. Seeded so an already-shared era
                  reads as shared after the list re-fetches. */}
              <ShareToFeedButton
                enabled={feedEnabled}
                eraId={era.id}
                initialSharedPostId={era.sharedPostId}
              />
            </div>
          ))}
        </div>
      ) : null}

      <div style={formStyle}>
        <Input
          aria-label={strings.design.eraTitlePlaceholder}
          placeholder={strings.design.eraTitlePlaceholder}
          value={title}
          maxLength={ERA_TITLE_MAX}
          disabled={creating}
          onChange={(event) => setTitle(event.target.value)}
        />
        <Input
          aria-label={strings.design.eraDescriptionPlaceholder}
          placeholder={strings.design.eraDescriptionPlaceholder}
          value={description}
          maxLength={ERA_DESCRIPTION_MAX}
          disabled={creating}
          onChange={(event) => setDescription(event.target.value)}
        />
        <Button variant="secondary" disabled={creating || title.trim().length === 0} onClick={submit} style={{ alignSelf: 'flex-start' }}>
          {strings.design.newEra}
        </Button>
      </div>
    </section>
  );
}
