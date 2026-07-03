'use client';

import { type CSSProperties } from 'react';
import { typeRamp } from '@era/tokens';
import { strings } from '@era/core/strings';
import { Button } from '../Button';

export interface ClosetEmptyProps {
  /** Start the add flow via the photo path. */
  onAddPhoto: () => void;
  /** Start the add flow via the paste-a-link path. */
  onAddLink: () => void;
}

/**
 * The empty closet — the state that sells the two ways in. A warm title and body
 * over both import affordances made prominent: a primary "Add a piece" (photo)
 * and a secondary "Add from a link". Copy is the canonical empty-gallery pair.
 */
export function ClosetEmpty({ onAddPhoto, onAddLink }: ClosetEmptyProps) {
  return (
    <div style={columnStyle}>
      <div style={copyStyle}>
        <h1 style={titleStyle}>{strings.closet.emptyTitle}</h1>
        <p style={bodyStyle}>{strings.closet.emptyBody}</p>
      </div>
      <div style={actionsStyle}>
        <Button variant="primary" onClick={onAddPhoto}>
          {strings.closet.addCta}
        </Button>
        <Button variant="secondary" onClick={onAddLink}>
          {strings.closet.addFromLink}
        </Button>
      </div>
    </div>
  );
}

const columnStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-8)',
  paddingBlock: 'var(--space-16)',
  maxWidth: 'var(--feed-col)',
};

const copyStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-3)',
};

const titleStyle: CSSProperties = {
  margin: 0,
  fontSize: typeRamp.title1.rem,
  lineHeight: `${typeRamp.title1.lineHeight}px`,
  fontWeight: 700,
};

const bodyStyle: CSSProperties = {
  margin: 0,
  fontSize: typeRamp.body.rem,
  lineHeight: `${typeRamp.body.lineHeight}px`,
  color: 'var(--color-secondary-strong)',
};

const actionsStyle: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 'var(--space-3)',
};
