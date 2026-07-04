'use client';

import { useState, type CSSProperties, type ReactNode } from 'react';
import { type PanInfo, motion } from 'framer-motion';
import { layout, spacing, typeRamp } from '@era/tokens';
import { strings } from '@era/core/strings';
import { Button } from '../Button';
import { GlassSheet } from '../GlassSheet';
import type { ItemEdits } from '../items';
import { ItemEditor } from './ItemEditor';
import type { GalleryItem } from './types';

export interface ItemDetailSheetProps {
  item: GalleryItem;
  /** Dismiss the sheet (backdrop, drag-down, or after an action). */
  onClose: () => void;
  /** The item was archived — remove it from the gallery. */
  onArchived: (id: string) => void;
  /** The item's tags were edited — replace it in the gallery. */
  onUpdated: (item: GalleryItem) => void;
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
export function ItemDetailSheet({ item, onClose, onArchived, onUpdated }: ItemDetailSheetProps) {
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
        <div style={imageWrapStyle}>
          {item.displayUrl ? <img src={item.displayUrl} alt={item.name} style={imageStyle} /> : null}
        </div>

        <div style={headerStyle}>
          <h2 style={titleStyle}>{item.name}</h2>
          {item.brand ? <p style={brandStyle}>{item.brand}</p> : null}
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
              <span style={metaStyle}>{strings.closet.detailSource(item.source)}</span>
              <span style={metaStyle}>{strings.closet.detailWearCount(item.wearCount)}</span>
              {priceLine ? <span style={metaStyle}>{priceLine}</span> : null}
            </div>

            {confirmingArchive ? (
              <div style={confirmColumnStyle}>
                <span style={confirmTextStyle}>{strings.closet.archiveConfirm}</span>
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
  return <span style={tagPillStyle}>{children}</span>;
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

const titleStyle: CSSProperties = {
  margin: 0,
  fontSize: typeRamp.title1.rem,
  lineHeight: `${typeRamp.title1.lineHeight}px`,
  fontWeight: 700,
};

const brandStyle: CSSProperties = {
  margin: 0,
  fontSize: typeRamp.body.rem,
  lineHeight: `${typeRamp.body.lineHeight}px`,
  color: 'var(--color-secondary-strong)',
};

const tagsRowStyle: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 'var(--space-2)',
};

const tagPillStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  minHeight: 'var(--touch-target-min)',
  paddingInline: 'var(--space-3)',
  borderRadius: 'var(--radius-chip)',
  fontSize: typeRamp.footnote.rem,
  lineHeight: `${typeRamp.footnote.lineHeight}px`,
  fontWeight: 600,
  background: 'var(--color-surface)',
  border: 'var(--glass-border-width) solid var(--color-hairline)',
  color: 'var(--color-secondary-strong)',
};

const metaColumnStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-1)',
};

const metaStyle: CSSProperties = {
  fontSize: typeRamp.subhead.rem,
  lineHeight: `${typeRamp.subhead.lineHeight}px`,
  color: 'var(--color-secondary-strong)',
};

const confirmColumnStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-3)',
};

const confirmTextStyle: CSSProperties = {
  fontSize: typeRamp.subhead.rem,
  lineHeight: `${typeRamp.subhead.lineHeight}px`,
  color: 'var(--color-text)',
};

const actionsRowStyle: CSSProperties = {
  display: 'flex',
  gap: 'var(--space-2)',
  justifyContent: 'flex-end',
};
