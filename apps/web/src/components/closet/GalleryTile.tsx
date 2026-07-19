'use client';

import { type CSSProperties } from 'react';
import { Text } from '../Text';
import { ItemSurface } from '../items/ItemSurface';
import type { GalleryItem } from './types';

export interface GalleryTileProps {
  item: GalleryItem;
  /** Open the detail sheet for this piece. */
  onOpen: () => void;
}

/**
 * One garment as a 2.5D cutout tile — the premium gallery unit. A thin wrapper
 * over the shared {@link ItemSurface} engine at `interactive:'full'` (tilt +
 * parallax + sheen slide + the hero lift), plus a footnote name caption below
 * the card. The unconfirmed accent dot rides in the engine's `badge` slot.
 *
 * Behaviour is identical to the standalone tile it replaced — it now also gains
 * the 1px hairline frame and the deeper `--item-lift` depth from the engine.
 */
export function GalleryTile({ item, onOpen }: GalleryTileProps) {
  const unconfirmed = !item.tagsConfirmed;
  const label = unconfirmed ? `${item.name} — tap to confirm` : item.name;

  return (
    <div style={wrapStyle}>
      <ItemSurface
        src={item.displayUrl}
        alt={label}
        interactive="full"
        onPress={onOpen}
        badge={unconfirmed ? <span style={dotStyle} aria-hidden="true" /> : null}
      />
      <Text
        variant="caption"
        size="footnote"
        as="p"
        style={{ margin: 0, color: 'var(--color-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
      >
        {item.name}
      </Text>
    </div>
  );
}

const wrapStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-2)',
};

// Accent dot marking an unconfirmed item ("tap to confirm").
const dotStyle: CSSProperties = {
  position: 'absolute',
  top: 'var(--item-card-padding)',
  right: 'var(--item-card-padding)',
  width: 'var(--space-2)',
  height: 'var(--space-2)',
  borderRadius: 'var(--radius-full)',
  background: 'var(--color-accent)',
  zIndex: 4,
};
