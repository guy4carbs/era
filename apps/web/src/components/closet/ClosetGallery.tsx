'use client';

import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { motion as motionToken, layout, spacing, typeRamp } from '@era/tokens';
import { strings } from '@era/core/strings';
import { transitionFor } from '../../lib/motion';
import { Chip } from '../Chip';
import { Input } from '../Input';
import { CATEGORY_OPTIONS } from '../items';
import { GalleryTile } from './GalleryTile';
import { ItemDetailSheet } from './ItemDetailSheet';
import { PrivacyToggle } from './PrivacyToggle';
import { SettingsLink } from './SettingsLink';
import type { GalleryItem } from './types';

export interface ClosetGalleryProps {
  items: GalleryItem[];
  /** Remove an archived item from the gallery. */
  onArchived: (id: string) => void;
  /** Replace an edited item in the gallery. */
  onUpdated: (item: GalleryItem) => void;
}

/** Debounce (ms) before the typed query is applied to the client-side filter. */
const SEARCH_DEBOUNCE_MS = 120;

// Responsive grid: 2 up on phones widening to 5 in the container. Media queries
// can't read CSS vars, so the rule is built from the token breakpoints + gutter.
const gridCss = [
  `.era-closet-grid{display:grid;gap:${layout.grid.gutter}px;grid-template-columns:repeat(2,minmax(0,1fr))}`,
  `@media(min-width:${layout.breakpoints.md}px){.era-closet-grid{grid-template-columns:repeat(3,minmax(0,1fr))}}`,
  `@media(min-width:${layout.breakpoints.lg}px){.era-closet-grid{grid-template-columns:repeat(4,minmax(0,1fr))}}`,
  `@media(min-width:${layout.breakpoints.xl}px){.era-closet-grid{grid-template-columns:repeat(5,minmax(0,1fr))}}`,
].join('\n');

/**
 * The stocked closet: a header (title + privacy toggle, search, category
 * filters) over a gallery of 2.5D tiles grouped by category in spec order.
 * Search filters live over name/brand/category/colours; a filter chip narrows to
 * one category. Tapping a tile opens the detail sheet (edit / archive). Filtered
 * or archived tiles leave via AnimatePresence.
 */
export function ClosetGallery({ items, onArchived, onUpdated }: ClosetGalleryProps) {
  const reduced = useReducedMotion();
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const [category, setCategory] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    const handle = setTimeout(() => setDebounced(query), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(handle);
  }, [query]);

  useEffect(() => {
    if (!toast) return;
    const handle = setTimeout(() => setToast(null), motionToken.durations.maxMs * 8);
    return () => clearTimeout(handle);
  }, [toast]);

  // Category chips reflect the categories actually present, in spec order, so
  // the row is stable while search/filter narrows the grid.
  const presentCategories = useMemo(
    () => CATEGORY_OPTIONS.filter((cat) => items.some((item) => item.category === cat)),
    [items],
  );

  const visible = useMemo(() => {
    const q = debounced.trim().toLowerCase();
    return items.filter((item) => {
      if (category && item.category !== category) return false;
      if (!q) return true;
      const haystack = [
        item.name,
        item.brand ?? '',
        item.category,
        strings.closet.categoryLabel(item.category),
        ...(item.colors ?? []),
      ]
        .join(' ')
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [items, debounced, category]);

  // Group the visible items by category, in spec order.
  const groups = useMemo(
    () =>
      CATEGORY_OPTIONS.map((cat) => ({
        category: cat,
        items: visible.filter((item) => item.category === cat),
      })).filter((group) => group.items.length > 0),
    [visible],
  );

  const selected = selectedId ? (items.find((item) => item.id === selectedId) ?? null) : null;

  function handleArchived(id: string) {
    setSelectedId(null);
    onArchived(id);
    setToast(strings.closet.archived);
  }

  function handleUpdated(item: GalleryItem) {
    onUpdated(item);
    setToast(strings.closet.itemSaved);
  }

  return (
    <div style={screenStyle}>
      <style>{gridCss}</style>

      <header style={headerStyle}>
        <div style={titleRowStyle}>
          <h1 style={titleStyle}>Closet</h1>
          <div style={headerActionsStyle}>
            <SettingsLink />
            <PrivacyToggle />
          </div>
        </div>

        <Input
          aria-label={strings.closet.searchPlaceholder}
          placeholder={strings.closet.searchPlaceholder}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />

        <div style={filterRowStyle} role="group" aria-label={strings.closet.filterAll}>
          <Chip selected={category === null} onClick={() => setCategory(null)}>
            {strings.closet.filterAll}
          </Chip>
          {presentCategories.map((cat) => (
            <Chip
              key={cat}
              selected={category === cat}
              onClick={() => setCategory((prev) => (prev === cat ? null : cat))}
            >
              {strings.closet.categoryLabel(cat)}
            </Chip>
          ))}
        </div>
      </header>

      {groups.map((group) => (
        <section key={group.category} style={sectionStyle}>
          <h2 style={sectionHeadingStyle}>{strings.closet.categoryLabel(group.category)}</h2>
          <div className="era-closet-grid">
            <AnimatePresence mode="popLayout">
              {group.items.map((item) => (
                <motion.div
                  key={item.id}
                  layout
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={transitionFor(motionToken.springs.gentle, reduced)}
                >
                  <GalleryTile item={item} onOpen={() => setSelectedId(item.id)} />
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </section>
      ))}

      <AnimatePresence>
        {selected ? (
          <motion.div
            key="backdrop"
            style={backdropStyle}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={transitionFor(motionToken.springs.gentle, reduced)}
            onClick={() => setSelectedId(null)}
          />
        ) : null}
      </AnimatePresence>
      <AnimatePresence>
        {selected ? (
          <ItemDetailSheet
            key={selected.id}
            item={selected}
            onClose={() => setSelectedId(null)}
            onArchived={handleArchived}
            onUpdated={handleUpdated}
          />
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {toast ? (
          <motion.div
            key={toast}
            role="status"
            style={toastStyle}
            initial={{ opacity: 0, x: '-50%', y: reduced ? 0 : spacing.s4 }}
            animate={{ opacity: 1, x: '-50%', y: 0 }}
            exit={{ opacity: 0, x: '-50%', y: reduced ? 0 : spacing.s4 }}
            transition={transitionFor(motionToken.springs.gentle, reduced)}
          >
            {toast}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

const screenStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-8)',
  paddingBlock: 'var(--space-8)',
};

const headerStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-4)',
};

const titleRowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'flex-start',
  justifyContent: 'space-between',
  gap: 'var(--space-4)',
};

// Right-hand cluster in the closet header: the Settings gear beside the privacy
// toggle, both top-aligned so the gear lines up with the toggle's label row.
const headerActionsStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'flex-start',
  gap: 'var(--space-3)',
};

const titleStyle: CSSProperties = {
  margin: 0,
  fontSize: typeRamp.largeTitle.rem,
  lineHeight: `${typeRamp.largeTitle.lineHeight}px`,
  fontWeight: 700,
};

const filterRowStyle: CSSProperties = {
  display: 'flex',
  gap: 'var(--space-2)',
  overflowX: 'auto',
  paddingBottom: 'var(--space-1)',
};

const sectionStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-4)',
};

const sectionHeadingStyle: CSSProperties = {
  margin: 0,
  fontSize: typeRamp.title3.rem,
  lineHeight: `${typeRamp.title3.lineHeight}px`,
  fontWeight: 700,
};

// Scrim behind the detail sheet; warm ink at partial opacity, below the sheet.
const backdropStyle: CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'color-mix(in srgb, var(--color-ink) 45%, transparent)',
  zIndex: 49,
};

const toastStyle: CSSProperties = {
  position: 'fixed',
  left: '50%',
  bottom: 'calc(var(--tabbar-height) + var(--space-6) + env(safe-area-inset-bottom))',
  paddingBlock: 'var(--space-2)',
  paddingInline: 'var(--space-4)',
  borderRadius: 'var(--radius-hero)',
  background: 'var(--color-text)',
  color: 'var(--color-bg)',
  fontSize: typeRamp.subhead.rem,
  lineHeight: `${typeRamp.subhead.lineHeight}px`,
  fontWeight: 600,
  zIndex: 60,
};
