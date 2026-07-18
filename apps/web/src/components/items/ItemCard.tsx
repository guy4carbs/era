'use client';

import { type CSSProperties } from 'react';
import { Card } from '../Card';
import { Text } from '../Text';
import type { ItemWithDisplay } from './types';

export interface ItemCardProps {
  item: ItemWithDisplay;
  /** Tap handler — resume-confirm for unconfirmed items, no-op otherwise. */
  onClick?: () => void;
}

const buttonStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-2)',
  padding: 0,
  border: 'none',
  background: 'transparent',
  cursor: 'pointer',
  textAlign: 'left',
  width: '100%',
};

const frameStyle: CSSProperties = {
  position: 'relative',
  height: '100%',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
};

const imageStyle: CSSProperties = {
  maxWidth: '100%',
  maxHeight: '100%',
  objectFit: 'contain',
};

// Accent dot marking an unconfirmed item ("tap to confirm").
const dotStyle: CSSProperties = {
  position: 'absolute',
  top: 0,
  right: 0,
  width: 'var(--space-2)',
  height: 'var(--space-2)',
  borderRadius: '50%',
  background: 'var(--color-accent)',
};


/**
 * One garment in the closet grid: a 4:5 item card showing the cutout on cream
 * with a footnote name caption. Unconfirmed items carry a subtle accent dot and
 * an accessible "tap to confirm" hint; the whole tile is a single tap target.
 */
export function ItemCard({ item, onClick }: ItemCardProps) {
  const unconfirmed = !item.tagsConfirmed;
  const label = unconfirmed ? `${item.name} — tap to confirm` : item.name;

  return (
    <button type="button" style={buttonStyle} onClick={onClick} aria-label={label}>
      <Card aspect="item" interactive>
        <div style={frameStyle}>
          {item.displayUrl ? (
            <img src={item.displayUrl} alt="" style={imageStyle} />
          ) : null}
          {unconfirmed ? <span style={dotStyle} aria-hidden="true" /> : null}
        </div>
      </Card>
      <Text variant="caption" size="footnote" as="p" style={{ margin: 0, color: 'var(--color-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.name}</Text>
    </button>
  );
}
