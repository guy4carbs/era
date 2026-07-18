'use client';

import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { type PanInfo, motion, useReducedMotion } from 'framer-motion';
import { motion as motionToken, layout, spacing } from '@era/tokens';
import { Text } from '../Text';
import { strings } from '@era/core/strings';
import { type TurnaroundRender, type TurnaroundState } from '@era/core/turnaround';
import { transitionFor } from '../../lib/motion';
import { Button } from '../Button';
import { GlassSheet } from '../GlassSheet';
import type { ItemEdits } from '../items';
import { AngleViewer } from './AngleViewer';
import { ItemEditor } from './ItemEditor';
import { ItemWearStats } from './ItemWearStats';
import {
  TurnaroundLimitError,
  TurnaroundUnavailableError,
  fetchTurnaround,
  generateTurnaround,
  pollTurnaround,
} from './turnaround-api';
import type { GalleryItem } from './types';

export interface ItemDetailSheetProps {
  item: GalleryItem;
  /**
   * Server-authoritative turnaround flag (request-time `ERA_TURNAROUND_ENABLED`,
   * threaded from the closet page's server wrapper). Off → the static cutout with
   * zero trace of the feature; on → the angle-viewer flow over the cutout.
   */
  turnaroundEnabled: boolean;
  /** Dismiss the sheet (backdrop, drag-down, or after an action). */
  onClose: () => void;
  /** The item was archived — remove it from the gallery. */
  onArchived: (id: string) => void;
  /** The item's tags were edited — replace it in the gallery. */
  onUpdated: (item: GalleryItem) => void;
  /** Surface a transient toast (the daily-limit line) via the gallery's own toast. */
  onToast: (message: string) => void;
}

// Drag-down past this distance (or fast enough) dismisses the sheet.
const DISMISS_DISTANCE = spacing.s16;
const DISMISS_VELOCITY = 500;

const titleCase = (value: string): string =>
  value.charAt(0).toUpperCase() + value.slice(1);

/** Human price line, e.g. "$120". Falls back to a plain code + amount. */
function formatPrice(price: string | null, currency: string | null): string | null {
  if (!price) return null;
  const amount = Number(price);
  if (currency && Number.isFinite(amount)) {
    try {
      return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(amount);
    } catch {
      // currency wasn't a valid ISO code — fall through to the plain form.
    }
  }
  return currency ? `${currency} ${price}` : price;
}

/**
 * The item detail sheet. Slides up as a frosted GlassSheet (peek → full),
 * showing the cutout large with its name, brand, read-only tag pills, provenance
 * line, price, and wear count. Two actions: Edit swaps the body for the compact
 * tag editor (PATCH `{ updates }`); Archive asks a gentle confirm then PATCHes
 * `{ archived: true }`, removing the tile. Dismisses on backdrop click (owned by
 * the gallery) or by dragging the sheet body down.
 */
export function ItemDetailSheet({
  item,
  turnaroundEnabled,
  onClose,
  onArchived,
  onUpdated,
  onToast,
}: ItemDetailSheetProps) {
  const [mode, setMode] = useState<'view' | 'edit'>('view');
  const [confirmingArchive, setConfirmingArchive] = useState(false);
  const [busy, setBusy] = useState(false);

  function handleDragEnd(_e: unknown, info: PanInfo) {
    if (info.offset.y > DISMISS_DISTANCE || info.velocity.y > DISMISS_VELOCITY) onClose();
  }

  async function saveEdits(edits: ItemEdits) {
    if (Object.keys(edits).length === 0) {
      setMode('view');
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/items/${item.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ updates: edits }),
      });
      if (!res.ok) throw new Error('item patch failed');
      const body = (await res.json()) as { item: Partial<GalleryItem> };
      // Merge the server's row over the current one, keeping the resolved
      // displayUrl/wearCount the list route already handed us.
      onUpdated({ ...item, ...body.item });
      setMode('view');
    } catch {
      // Leave the editor open so the user can retry; no destructive change made.
    } finally {
      setBusy(false);
    }
  }

  async function archive() {
    setBusy(true);
    try {
      const res = await fetch(`/api/items/${item.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ archived: true }),
      });
      if (!res.ok) throw new Error('archive failed');
      onArchived(item.id);
    } catch {
      setConfirmingArchive(false);
    } finally {
      setBusy(false);
    }
  }

  const priceLine = formatPrice(item.purchasePrice, item.currency);

  return (
    <GlassSheet peek>
      <motion.div
        style={bodyStyle}
        drag="y"
        dragConstraints={{ top: 0, bottom: 0 }}
        dragElastic={0.35}
        onDragEnd={handleDragEnd}
      >
        {/* Turnaround views (flag-gated): the swipe/click-through angle viewer when
            renders exist, else the untouched static cutout as the exact fallback. */}
        {turnaroundEnabled && item.displayUrl ? (
          <TurnaroundHero key={item.id} item={item} onToast={onToast} />
        ) : (
          <StaticCutout item={item} />
        )}

        <div style={headerStyle}>
          <Text variant="title" size="title1" as="h2" style={{ margin: 0 }}>
            {item.name}
          </Text>
          {item.brand ? (
            <Text variant="body" as="p" style={{ margin: 0, color: 'var(--color-secondary-strong)' }}>
              {item.brand}
            </Text>
          ) : null}
        </div>

        {mode === 'edit' ? (
          <ItemEditor item={item} busy={busy} onSave={saveEdits} onCancel={() => setMode('view')} />
        ) : (
          <>
            <div style={tagsRowStyle}>
              <TagPill>{titleCase(item.category)}</TagPill>
              {item.colorPrimary ? <TagPill>{titleCase(item.colorPrimary)}</TagPill> : null}
              {item.pattern ? <TagPill>{titleCase(item.pattern)}</TagPill> : null}
            </div>

            <div style={metaColumnStyle}>
              <Text variant="caption" size="subhead" as="span" style={{ color: 'var(--color-secondary-strong)' }}>
                {strings.closet.detailSource(item.source)}
              </Text>
              {priceLine ? (
                <Text variant="caption" size="subhead" as="span" style={{ color: 'var(--color-secondary-strong)' }}>
                  {priceLine}
                </Text>
              ) : null}
            </div>

            <ItemWearStats item={item} />

            {confirmingArchive ? (
              <div style={confirmColumnStyle}>
                <Text variant="ui" size="subhead" as="span" style={{ color: 'var(--color-text)' }}>
                  {strings.closet.archiveConfirm}
                </Text>
                <div style={actionsRowStyle}>
                  <Button variant="secondary" onClick={() => setConfirmingArchive(false)}>
                    {strings.common.cancel}
                  </Button>
                  <Button variant="primary" disabled={busy} onClick={archive}>
                    {strings.closet.archive}
                  </Button>
                </div>
              </div>
            ) : (
              <div style={actionsRowStyle}>
                <Button variant="secondary" onClick={() => setConfirmingArchive(true)}>
                  {strings.closet.archive}
                </Button>
                <Button variant="primary" onClick={() => setMode('edit')}>
                  {strings.closet.edit}
                </Button>
              </div>
            )}
          </>
        )}
      </motion.div>
    </GlassSheet>
  );
}

/** Read-only pill echoing a tag on the detail sheet (not interactive). */
function TagPill({ children }: { children: ReactNode }) {
  return (
    <Text
      variant="caption"
      size="footnote"
      weight={600}
      as="span"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        minHeight: 'var(--touch-target-min)',
        paddingInline: 'var(--space-3)',
        borderRadius: 'var(--radius-chip)',
        background: 'var(--color-surface)',
        border: 'var(--glass-border-width) solid var(--color-hairline)',
        color: 'var(--color-secondary-strong)',
      }}
    >
      {children}
    </Text>
  );
}

/**
 * The static cutout — the exact original detail image, kept verbatim as the
 * turnaround fallback (flag off, no cutout, or no accepted renders).
 */
function StaticCutout({ item }: { item: GalleryItem }) {
  return (
    <div style={imageWrapStyle}>
      {item.displayUrl ? <img src={item.displayUrl} alt={item.name} style={imageStyle} /> : null}
    </div>
  );
}

/**
 * SEO alt-base descriptor for the angle pages, composed from the item's tags
 * (colour / brand / category) per the repo's alt-text convention. e.g.
 * "Black Acme Coat". Empty when the piece carries no tags at all.
 */
function describeItem(item: GalleryItem): string {
  return [item.colorPrimary, item.brand, strings.closet.categoryLabel(item.category)]
    .filter((part): part is string => Boolean(part && part.trim()))
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

/** The turnaround surface's UI phase — drives which chrome shows over the cutout. */
type TurnaroundPhase = 'fallback' | 'offer' | 'generating' | 'angles' | 'empty';

/**
 * The turnaround-aware hero. On open it reads the item's turnaround state (silent
 * failure → the static cutout, nothing surfaced). Complete renders show the
 * {@link AngleViewer}; a still-`running` run polls to completion; an eligible
 * un-run piece offers a quiet "View angles" that kicks the slow generation and
 * animates the viewer in. A daily cap toasts the pause line, the feature being off
 * shows the dormant "unavailable" beat, a QA-passed-nothing run shows one calm
 * line, and any other miss is a calm retryable notice with the button back.
 */
function TurnaroundHero({ item, onToast }: { item: GalleryItem; onToast: (message: string) => void }) {
  const reduced = useReducedMotion();
  const [phase, setPhase] = useState<TurnaroundPhase>('fallback');
  const [renders, setRenders] = useState<readonly TurnaroundRender[]>([]);
  const [notice, setNotice] = useState<string | null>(null);

  // A generation runs ~60–90s; guard every settle against a closed sheet so a
  // late resolve can't set state on an unmounted piece.
  const activeRef = useRef(true);

  const finishGeneration = useCallback((state: TurnaroundState) => {
    if (state.renders.length > 0) {
      setRenders(state.renders);
      setPhase('angles');
    } else {
      // Completed, but QA passed nothing — one calm terminal line with no
      // retry verb, because this state offers no button to retry with.
      setNotice(strings.turnaround.noAngles);
      setPhase('empty');
    }
  }, []);

  const handleGenerateError = useCallback(
    (error: unknown) => {
      if (error instanceof TurnaroundLimitError) {
        onToast(strings.ovi.limitReachedProcessing);
        setPhase('offer'); // the cap resets tomorrow — leave the affordance
      } else if (error instanceof TurnaroundUnavailableError) {
        setNotice(strings.turnaround.unavailable);
        setPhase('empty');
      } else {
        setNotice(strings.turnaround.failed);
        setPhase('offer'); // calm, retryable — button back
      }
    },
    [onToast],
  );

  const runGeneration = useCallback(() => {
    setNotice(null);
    setPhase('generating');
    void (async () => {
      try {
        const state = await generateTurnaround(item.id);
        if (activeRef.current) finishGeneration(state);
      } catch (error) {
        if (activeRef.current) handleGenerateError(error);
      }
    })();
  }, [item.id, finishGeneration, handleGenerateError]);

  useEffect(() => {
    activeRef.current = true;
    let cancelled = false;
    void (async () => {
      try {
        const state = await fetchTurnaround(item.id);
        if (cancelled) return;
        if (state.status === 'complete' && state.renders.length > 0) {
          setRenders(state.renders);
          setPhase('angles');
        } else if (state.status === 'running') {
          setPhase('generating');
          try {
            const settled = await pollTurnaround(item.id);
            if (!cancelled && activeRef.current) finishGeneration(settled);
          } catch (error) {
            if (!cancelled && activeRef.current) handleGenerateError(error);
          }
        } else if ((state.status === 'none' || state.status === 'failed') && state.categoryEnabled) {
          setPhase('offer');
        } else {
          setPhase('fallback');
        }
      } catch {
        // Silent: no turnaround for this piece (404 / flag off / not owner) — the
        // static cutout stays exactly as it was, nothing surfaced.
      }
    })();
    return () => {
      cancelled = true;
      activeRef.current = false;
    };
  }, [item.id, finishGeneration, handleGenerateError]);

  const frontUrl = item.displayUrl;
  if (!frontUrl) return <StaticCutout item={item} />;

  if (phase === 'angles') {
    return (
      <motion.div
        initial={reduced ? false : { opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={transitionFor(motionToken.springs.gentle, reduced)}
      >
        <AngleViewer frontUrl={frontUrl} renders={renders} frontAlt={item.name} altBase={describeItem(item)} />
      </motion.div>
    );
  }

  return (
    <div style={turnaroundColumnStyle}>
      <StaticCutout item={item} />
      {phase === 'generating' ? (
        <Text variant="caption" size="subhead" as="span" role="status" style={{ color: 'var(--color-secondary-strong)' }}>
          {strings.turnaround.generating}
        </Text>
      ) : null}
      {notice ? (
        <Text variant="caption" size="subhead" as="span" style={{ color: 'var(--color-secondary-strong)' }}>
          {notice}
        </Text>
      ) : null}
      {phase === 'offer' ? (
        <div style={turnaroundActionRowStyle}>
          <Button variant="secondary" onClick={runGeneration}>
            {strings.turnaround.viewAngles}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

const bodyStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-6)',
  paddingBottom: 'var(--space-8)',
};

const imageWrapStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  aspectRatio: layout.itemCard.aspectRatio,
  padding: 'var(--space-6)',
  background: 'var(--color-surface)',
  borderRadius: 'var(--radius-card)',
};

const imageStyle: CSSProperties = {
  maxWidth: '100%',
  maxHeight: '100%',
  objectFit: 'contain',
};

const headerStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-1)',
};

const tagsRowStyle: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 'var(--space-2)',
};

const metaColumnStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-1)',
};

const confirmColumnStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-3)',
};

const actionsRowStyle: CSSProperties = {
  display: 'flex',
  gap: 'var(--space-2)',
  justifyContent: 'flex-end',
};

// Turnaround chrome: the cutout with a calm note/affordance stacked beneath it
// (offer / generating / notice states — the angle viewer replaces the whole block).
const turnaroundColumnStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-3)',
};

const turnaroundActionRowStyle: CSSProperties = {
  display: 'flex',
  justifyContent: 'flex-start',
};
