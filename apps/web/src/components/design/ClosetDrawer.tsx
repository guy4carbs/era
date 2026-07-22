'use client';

import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { layout } from '@era/tokens';
import { Text } from '../Text';
import { strings } from '@era/core/strings';
import { OviLoader } from '../ovi/OviLoader';
import { pressProps } from '../../lib/motion';
import { GlassSheet } from '../GlassSheet';
import { Chip } from '../Chip';
import { Input } from '../Input';
import { Card } from '../Card';
import { CATEGORY_OPTIONS, type ItemWithDisplay } from '../items';

export interface ClosetDrawerProps {
  /** Closet items, or null while loading. */
  items: ItemWithDisplay[] | null;
  /** itemIds already on the stage (an item can appear once). */
  placedIds: Set<string>;
  onAdd: (item: ItemWithDisplay) => void;
}

const SEARCH_DEBOUNCE_MS = 120;

// 3-up on phones, widening with the container — the sheet is edge-to-edge.
const gridCss = [
  `.era-drawer-grid{display:grid;gap:${layout.grid.gutter}px;grid-template-columns:repeat(3,minmax(0,1fr))}`,
  `@media(min-width:${layout.breakpoints.md}px){.era-drawer-grid{grid-template-columns:repeat(4,minmax(0,1fr))}}`,
  `@media(min-width:${layout.breakpoints.lg}px){.era-drawer-grid{grid-template-columns:repeat(6,minmax(0,1fr))}}`,
].join('\n');

const headerStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-3)',
  paddingBottom: 'var(--space-3)',
};

const chipRowStyle: CSSProperties = {
  display: 'flex',
  gap: 'var(--space-2)',
  overflowX: 'auto',
  paddingBottom: 'var(--space-1)',
};

const tileButtonStyle: CSSProperties = {
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

/**
 * The closet as a bottom drawer over the canvas: a frosted peek sheet the user
 * drags up to expand, with search + category filters and a grid of cutouts.
 * Tapping a piece drops it onto the stage; a piece already placed reads as added
 * and can't be re-added (each item appears once per outfit).
 */
export function ClosetDrawer({ items, placedIds, onAdd }: ClosetDrawerProps) {
  const reduced = useReducedMotion();
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const [category, setCategory] = useState<string | null>(null);

  useEffect(() => {
    const handle = setTimeout(() => setDebounced(query), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(handle);
  }, [query]);

  const present = useMemo(
    () => CATEGORY_OPTIONS.filter((cat) => (items ?? []).some((item) => item.category === cat)),
    [items],
  );

  const visible = useMemo(() => {
    const q = debounced.trim().toLowerCase();
    return (items ?? []).filter((item) => {
      if (category && item.category !== category) return false;
      if (!q) return true;
      const haystack = [item.name, item.brand ?? '', item.category, strings.closet.categoryLabel(item.category)]
        .join(' ')
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [items, debounced, category]);

  return (
    <GlassSheet peek>
      <style>{gridCss}</style>
      <div style={headerStyle}>
        <Text variant="ui" size="subhead" weight={700} as="h2" style={{ margin: 0 }}>
          {strings.design.addFromCloset}
        </Text>
        <Input
          aria-label={strings.design.drawerSearchPlaceholder}
          placeholder={strings.design.drawerSearchPlaceholder}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <div style={chipRowStyle} role="group" aria-label={strings.closet.filterAll}>
          <Chip selected={category === null} onClick={() => setCategory(null)}>
            {strings.closet.filterAll}
          </Chip>
          {present.map((cat) => (
            <Chip
              key={cat}
              selected={category === cat}
              onClick={() => setCategory((prev) => (prev === cat ? null : cat))}
            >
              {strings.closet.categoryLabel(cat)}
            </Chip>
          ))}
        </div>
      </div>

      {items === null ? (
        <div style={{ padding: 'var(--space-6) 0' }}>
          <OviLoader variant="inline" label={strings.closet.subtitle} />
        </div>
      ) : visible.length === 0 ? (
        <Text variant="body" as="p" style={{ margin: 0, padding: 'var(--space-6) 0', color: 'var(--color-secondary-strong)' }}>{strings.closet.empty}</Text>
      ) : (
        <div className="era-drawer-grid">
          {visible.map((item) => {
            const placed = placedIds.has(item.id);
            return (
              <motion.button
                key={item.id}
                type="button"
                style={{ ...tileButtonStyle, opacity: placed ? 0.45 : 1, cursor: placed ? 'default' : 'pointer' }}
                aria-label={placed ? `${item.name} — added` : `Add ${item.name}`}
                aria-disabled={placed}
                onClick={() => {
                  if (!placed) onAdd(item);
                }}
                {...pressProps(reduced, !placed)}
              >
                <Card aspect="item" interactive={!placed}>
                  <div style={frameStyle}>
                    {item.displayUrl ? <img src={item.displayUrl} alt="" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} /> : null}
                  </div>
                </Card>
                <Text
                  variant="caption"
                  size="footnote"
                  as="p"
                  style={{ margin: 0, color: 'var(--color-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                >
                  {item.name}
                </Text>
              </motion.button>
            );
          })}
        </div>
      )}
    </GlassSheet>
  );
}
