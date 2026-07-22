'use client';

import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { useRouter } from 'next/navigation';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { motion as motionToken, layout, spacing } from '@era/tokens';
import { Text } from '../Text';
import { strings } from '@era/core/strings';
import { transitionFor, useStagger, viewTransition } from '../../lib/motion';
import { Chip } from '../Chip';
import { Input } from '../Input';
import { CATEGORY_OPTIONS } from '../items';
import { GalleryTile } from './GalleryTile';
import { ItemDetailSheet } from './ItemDetailSheet';
import { PrivacyToggle } from './PrivacyToggle';
import { SettingsLink } from './SettingsLink';
import { WornLink } from './WornLink';
import type { GalleryItem } from './types';

export interface ClosetGalleryProps {
  items: GalleryItem[];
  /**
   * Server-authoritative turnaround flag, threaded from the closet page's server
   * wrapper (request-time `ERA_TURNAROUND_ENABLED`, never a `NEXT_PUBLIC_*` read).
   * Handed to the detail sheet's angle-viewer flow.
   */
  turnaroundEnabled: boolean;
  /** Remove an archived item from the gallery. */
  onArchived: (id: string) => void;
  /** Replace an edited item in the gallery. */
  onUpdated: (item: GalleryItem) => void;
}

/** Debounce (ms) before the typed query is applied to the client-side filter. */
const SEARCH_DEBOUNCE_MS = 120;

/** Grid density: comfortable is the editorial default; compact adds a column. */
type Density = 'comfortable' | 'compact';

const DENSITY_STORAGE_KEY = 'era-closet-density';

/**
 * Editorial-spread grid. Column-gap holds the 12px horizontal gutter; row-gap
 * opens to the phi-scaled VERTICAL gutter (20px) so rows read like a magazine
 * page. Media queries can't read CSS vars, so the rule is built from the token
 * breakpoints + the grid gutters. Two density variants ship as sibling rules
 * toggled by a `data-density` attribute on the grid:
 *   comfortable — 2 / 3 / 4 (lg=desktopColumnsMin) / 5, row-gap gutterTall.
 *   compact     — +1 column per step: 3 / 4 / 5 / 6 (desktopColumnsMax), row-gap gutter.
 * No new breakpoint is introduced — the 6th column arrives via compact density at
 * xl rather than a hardcoded 1536px query.
 */
const gridCss = [
  `.era-closet-grid{display:grid;column-gap:${layout.grid.gutter}px;row-gap:${layout.grid.gutterTall}px;grid-template-columns:repeat(2,minmax(0,1fr))}`,
  `.era-closet-grid[data-density="compact"]{row-gap:${layout.grid.gutter}px;grid-template-columns:repeat(3,minmax(0,1fr))}`,
  `@media(min-width:${layout.breakpoints.md}px){.era-closet-grid{grid-template-columns:repeat(3,minmax(0,1fr))}.era-closet-grid[data-density="compact"]{grid-template-columns:repeat(4,minmax(0,1fr))}}`,
  `@media(min-width:${layout.breakpoints.lg}px){.era-closet-grid{grid-template-columns:repeat(${layout.grid.desktopColumnsMin},minmax(0,1fr))}.era-closet-grid[data-density="compact"]{grid-template-columns:repeat(5,minmax(0,1fr))}}`,
  `@media(min-width:${layout.breakpoints.xl}px){.era-closet-grid{grid-template-columns:repeat(5,minmax(0,1fr))}.era-closet-grid[data-density="compact"]{grid-template-columns:repeat(${layout.grid.desktopColumnsMax},minmax(0,1fr))}}`,
].join('\n');

/**
 * Cascade the entrance stagger once per JS session, not once per mount. The
 * closet re-mounts on every visit (tab switch, route change), and a per-instance
 * ref re-ran the 45ms cascade each time; this module-level flag lets only the
 * first stocked render of the session stagger. Reduced motion is unaffected
 * (the stagger variants collapse to a fade regardless).
 */
let hasCascadedThisSession = false;

/**
 * Read the persisted density once, SSR-safe, mirroring lib/theme.tsx's storage
 * pattern (try/catch, unknown values fall back to the default).
 */
function readStoredDensity(): Density {
  if (typeof window === 'undefined') return 'comfortable';
  try {
    const raw = localStorage.getItem(DENSITY_STORAGE_KEY);
    if (raw === 'comfortable' || raw === 'compact') return raw;
  } catch {
    // Storage unavailable (private mode / SSR mismatch) — keep the default.
  }
  return 'comfortable';
}

/**
 * The stocked closet: a header (title + privacy toggle, search, category
 * filters) over a gallery of 2.5D tiles grouped by category in spec order.
 * Search filters live over name/brand/category/colours; a filter chip narrows to
 * one category. Tapping a tile opens the detail sheet (edit / archive). Filtered
 * or archived tiles leave via AnimatePresence.
 */
export function ClosetGallery({ items, turnaroundEnabled, onArchived, onUpdated }: ClosetGalleryProps) {
  const reduced = useReducedMotion();
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const [category, setCategory] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [density, setDensity] = useState<Density>('comfortable');

  // Hydrate the stored density after mount to stay SSR-safe (read once).
  useEffect(() => {
    setDensity(readStoredDensity());
  }, []);

  const changeDensity = (next: Density) => {
    setDensity(next);
    try {
      localStorage.setItem(DENSITY_STORAGE_KEY, next);
    } catch {
      // Non-fatal: the choice simply won't persist across reloads.
    }
  };

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

  // Stagger the tiles on the first stocked render of the SESSION only. The flag
  // is FROZEN per instance (useState initializer, not a per-render read): the
  // old `!didMount.current && !hasCascaded` recomputed every render, so the
  // first re-render after mount ripped the variants off tiles mid-cascade —
  // opacity recovered via the fallback animate target, but the entrance
  // `filter: blur(4px)` and rise had no new target and FROZE (the stuck-blur
  // closet bug on prod, 2026-07-19). With the flag constant, variants stay
  // attached until unmount and the cascade completes; later closet visits this
  // session skip the cascade entirely (plain opacity fade below).
  const stagger = useStagger(reduced);
  const [staggerOnMount] = useState(() => !hasCascadedThisSession);
  useEffect(() => {
    hasCascadedThisSession = true;
  }, []);

  function handleArchived(id: string) {
    setSelectedId(null);
    onArchived(id);
    setToast(strings.closet.archived);
  }

  function handleUpdated(item: GalleryItem) {
    onUpdated(item);
    setToast(strings.closet.itemSaved);
  }

  // A tap on a confirmed piece opens the detail sheet; a tap on an unconfirmed
  // draft (the accent dot's "tap to confirm" promise) resumes it straight into
  // the confirm screen via the add flow's existing `?item=` resume path — the
  // one surface where tags_confirmed actually gets flipped.
  function openTile(item: GalleryItem) {
    if (item.tagsConfirmed) {
      setSelectedId(item.id);
    } else {
      viewTransition(() => router.push(`/closet/add?item=${item.id}`));
    }
  }

  return (
    <div style={screenStyle}>
      <style>{gridCss}</style>

      <header style={headerStyle}>
        <div style={titleRowStyle}>
          <div style={titleBlockStyle}>
            <Text variant="largeTitle" as="h1" style={{ margin: 0 }}>Closet</Text>
            {/* The stocked closet introduces itself by its size — the live piece
                count replaces the static subtitle. */}
            <Text variant="body" as="p" style={{ margin: 0, color: 'var(--color-secondary)' }}>
              {strings.closet.pieceCount(items.length)}
            </Text>
          </div>
          <div style={headerActionsStyle}>
            <WornLink />
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

        <div style={filterBarStyle}>
          <div style={filterRowStyle} role="group" aria-label={strings.closet.filterAll}>
            <Chip glass selected={category === null} onClick={() => setCategory(null)}>
              {strings.closet.filterAll}
            </Chip>
            {presentCategories.map((cat) => (
              <Chip
                glass
                key={cat}
                selected={category === cat}
                onClick={() => setCategory((prev) => (prev === cat ? null : cat))}
              >
                {strings.closet.categoryLabel(cat)}
              </Chip>
            ))}
          </div>

          {/* Quiet two-state density control: comfortable adds air, compact packs
              one more column per breakpoint. aria-pressed marks the active choice. */}
          <div style={densityRowStyle} role="group" aria-label={strings.closet.densityLabel}>
            <Chip
              glass
              selected={density === 'comfortable'}
              aria-label={strings.closet.densityComfortable}
              onClick={() => changeDensity('comfortable')}
            >
              {strings.closet.densityComfortable}
            </Chip>
            <Chip
              glass
              selected={density === 'compact'}
              aria-label={strings.closet.densityCompact}
              onClick={() => changeDensity('compact')}
            >
              {strings.closet.densityCompact}
            </Chip>
          </div>
        </div>
      </header>

      {groups.map((group) => (
        <section key={group.category} style={sectionStyle}>
          {/* Editorial section label: Fraunces Italic (oviAccent) at its default
              size, then a hairline rule filling the row to the right. */}
          <div style={sectionHeadingStyle}>
            <Text variant="oviAccent" as="h2" style={{ margin: 0 }}>
              {strings.closet.categoryLabel(group.category)}
            </Text>
            <span aria-hidden="true" style={hairlineStyle} />
          </div>
          <motion.div
            className="era-closet-grid"
            data-density={density}
            // First paint: orchestrate the entrance stagger across the tiles.
            // Subsequent filter renders skip it (empty variants) so the grid
            // reveals immediately and only the presence opacity below animates.
            variants={staggerOnMount ? stagger.container : undefined}
            initial={staggerOnMount ? 'hidden' : false}
            animate={staggerOnMount ? 'visible' : undefined}
          >
            <AnimatePresence mode="popLayout">
              {group.items.map((item) => (
                <motion.div
                  key={item.id}
                  layout
                  variants={staggerOnMount ? stagger.item : undefined}
                  initial={staggerOnMount ? undefined : { opacity: 0 }}
                  animate={staggerOnMount ? undefined : { opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={transitionFor(motionToken.springs.gentle, reduced)}
                >
                  <GalleryTile item={item} onOpen={() => openTile(item)} />
                </motion.div>
              ))}
            </AnimatePresence>
          </motion.div>
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
            closet={items}
            turnaroundEnabled={turnaroundEnabled}
            onClose={() => setSelectedId(null)}
            onArchived={handleArchived}
            onUpdated={handleUpdated}
            onToast={setToast}
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
            <Text variant="ui" size="subhead" weight={600} style={{ color: 'var(--color-bg)' }}>
              {toast}
            </Text>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

const screenStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  // D6 section rhythm — 52px between the header and each category section, and
  // between sections. Spacing INSIDE the header stays on its own smaller gap.
  gap: 'var(--rhythm-section-above)',
  paddingBlock: 'var(--space-8)',
};

const headerStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-4)',
};

// The title + its one-line subtitle group tightly on the left of the header row,
// with the action cluster (worn / settings / privacy) held to the right.
const titleBlockStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-1)',
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

// The filter row and the density toggle share one bar: filters flow and scroll
// on the left, the density control holds to the right and never wraps.
const filterBarStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 'var(--space-3)',
};

const filterRowStyle: CSSProperties = {
  display: 'flex',
  gap: 'var(--space-2)',
  overflowX: 'auto',
  paddingBottom: 'var(--space-1)',
  minWidth: 0,
};

const densityRowStyle: CSSProperties = {
  display: 'flex',
  gap: 'var(--space-2)',
  flex: 'none',
};

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
  zIndex: 60,
};
