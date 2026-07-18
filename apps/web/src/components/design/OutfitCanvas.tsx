'use client';

import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react';
import { useRouter } from 'next/navigation';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { layout, motion as motionToken, boxShadows } from '@era/tokens';
import { Text } from '../Text';
import { strings } from '@era/core/strings';
import { transitionFor } from '../../lib/motion';
import { trackFirstOnce } from '../../lib/analytics';
import { useSession } from '../../lib/auth-client';
import type { ItemWithDisplay } from '../items';
import { CanvasStage } from './CanvasStage';
import { ClosetDrawer } from './ClosetDrawer';
import { ItemControlBar } from './ItemControlBar';
import { SaveOutfitSheet } from './SaveOutfitSheet';
import { composeCover } from './compose-cover';
import {
  DEFAULT_SCALE,
  MAX_ITEMS,
  clamp,
  type OutfitDetail,
  type PlacedItem,
} from './types';

export interface OutfitCanvasProps {
  /** When set, reopen this saved outfit and re-save via PATCH. */
  outfitId: string | null;
}

const rootStyle: CSSProperties = {
  position: 'fixed',
  inset: 0,
  display: 'flex',
  flexDirection: 'column',
  height: '100dvh',
  background: 'var(--color-bg)',
  overflow: 'hidden',
};

const topBarStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 'var(--space-3)',
  paddingInline: 'var(--space-4)',
  paddingTop: 'calc(var(--space-3) + env(safe-area-inset-top))',
  paddingBottom: 'var(--space-3)',
};

const iconBtnStyle: CSSProperties = {
  minWidth: 'var(--touch-target-min)',
  minHeight: 'var(--touch-target-min)',
  borderRadius: 'var(--radius-chip)',
  border: '1px solid var(--color-hairline)',
  background: 'var(--color-surface)',
  color: 'var(--color-text)',
  cursor: 'pointer',
};

const saveBtnStyle: CSSProperties = {
  minHeight: 'var(--touch-target-min)',
  paddingInline: 'var(--space-4)',
  borderRadius: 'var(--radius-input)',
  border: 'none',
  background: 'var(--color-accent)',
  color: 'var(--color-ink)',
  fontWeight: 700,
  cursor: 'pointer',
  boxShadow: boxShadows.e1,
};

const controlSlotStyle: CSSProperties = {
  display: 'flex',
  justifyContent: 'center',
  paddingInline: 'var(--space-4)',
  paddingBottom: 'var(--space-3)',
  minHeight: 'var(--touch-target-min)',
};

// Reserve the drawer's peek height so the stage never hides behind it. The
// fraction is a layout token, applied via calc (no literal dimension).
const drawerSpacerStyle: CSSProperties = {
  height: `calc(${layout.sheetPeekFraction} * 100dvh)`,
  flexShrink: 0,
};

const toastStyle: CSSProperties = {
  position: 'fixed',
  left: '50%',
  bottom: 'calc(var(--space-8) + env(safe-area-inset-bottom))',
  paddingInline: 'var(--space-4)',
  paddingBlock: 'var(--space-3)',
  borderRadius: 'var(--radius-input)',
  background: 'var(--color-surface)',
  border: '1px solid var(--color-hairline)',
  boxShadow: boxShadows.e3,
  zIndex: 70,
};

const TOAST_MS = motionToken.durations.maxMs * 8;

/**
 * The outfit canvas: a full-screen stage over a closet drawer. Pull pieces from
 * the drawer onto the stage, drag/scale/rotate/restack each one, then save —
 * which composes a cover and persists the placements. With `outfitId` it reopens
 * a saved outfit at its exact transforms and re-saves via PATCH.
 */
export function OutfitCanvas({ outfitId }: OutfitCanvasProps) {
  const router = useRouter();
  const reduced = useReducedMotion();
  const { data: session } = useSession();

  const [items, setItems] = useState<ItemWithDisplay[] | null>(null);
  const [placed, setPlaced] = useState<PlacedItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [saveOpen, setSaveOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [prefill, setPrefill] = useState<{ name: string; occasion: string }>({ name: '', occasion: '' });

  // Closet pieces for the drawer.
  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const res = await fetch('/api/items');
        if (!res.ok) throw new Error('items fetch failed');
        const body = (await res.json()) as { items: ItemWithDisplay[] };
        if (active) setItems(body.items);
      } catch {
        if (active) setItems([]);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  // Reopen: hydrate the stage from the saved transforms + layer order.
  useEffect(() => {
    if (!outfitId) return;
    let active = true;
    void (async () => {
      try {
        const res = await fetch(`/api/outfits/${outfitId}`);
        if (!res.ok) throw new Error('outfit fetch failed');
        const body = (await res.json()) as { outfit: OutfitDetail };
        if (!active) return;
        setPlaced(
          body.outfit.items.map((m) => ({
            itemId: m.itemId,
            name: m.item.name,
            category: m.item.category,
            displayUrl: m.item.displayUrl,
            layerOrder: m.layerOrder,
            posX: m.posX,
            posY: m.posY,
            scale: m.scale,
            rotation: m.rotation,
          })),
        );
        setPrefill({ name: body.outfit.name ?? '', occasion: body.outfit.occasion ?? '' });
      } catch {
        if (active) setToast(strings.errors.generic);
      }
    })();
    return () => {
      active = false;
    };
  }, [outfitId]);

  useEffect(() => {
    if (!toast) return;
    const handle = setTimeout(() => setToast(null), TOAST_MS);
    return () => clearTimeout(handle);
  }, [toast]);

  const placedIds = useMemo(() => new Set(placed.map((p) => p.itemId)), [placed]);

  const addItem = useCallback((item: ItemWithDisplay) => {
    setPlaced((prev) => {
      if (prev.some((p) => p.itemId === item.id) || prev.length >= MAX_ITEMS) return prev;
      const nextLayer = prev.reduce((max, p) => Math.max(max, p.layerOrder), -1) + 1;
      return [
        ...prev,
        {
          itemId: item.id,
          name: item.name,
          category: item.category,
          displayUrl: item.displayUrl,
          layerOrder: nextLayer,
          posX: 0.5,
          posY: 0.5,
          scale: DEFAULT_SCALE,
          rotation: 0,
        },
      ];
    });
    setSelectedId(item.id);
  }, []);

  const commitPos = useCallback((itemId: string, posX: number, posY: number) => {
    setPlaced((prev) => prev.map((p) => (p.itemId === itemId ? { ...p, posX, posY } : p)));
  }, []);

  const patchPiece = useCallback((itemId: string, patch: Partial<PlacedItem>) => {
    setPlaced((prev) => prev.map((p) => (p.itemId === itemId ? { ...p, ...patch } : p)));
  }, []);

  const restack = useCallback((itemId: string, dir: 1 | -1) => {
    setPlaced((prev) => {
      const sorted = [...prev].sort((a, b) => a.layerOrder - b.layerOrder);
      const idx = sorted.findIndex((p) => p.itemId === itemId);
      const swapIdx = idx + dir;
      const here = sorted[idx];
      const other = sorted[swapIdx];
      if (!here || !other) return prev;
      return prev.map((p) => {
        if (p.itemId === here.itemId) return { ...p, layerOrder: other.layerOrder };
        if (p.itemId === other.itemId) return { ...p, layerOrder: here.layerOrder };
        return p;
      });
    });
  }, []);

  const removePiece = useCallback((itemId: string) => {
    setPlaced((prev) => prev.filter((p) => p.itemId !== itemId));
    setSelectedId((prev) => (prev === itemId ? null : prev));
  }, []);

  async function uploadCover(blob: Blob): Promise<string | null> {
    try {
      const res = await fetch('/api/outfits/cover-url', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ext: 'png', contentType: 'image/png' }),
      });
      if (!res.ok) return null;
      const { url, key } = (await res.json()) as { url: string; key: string };
      const put = await fetch(url, { method: 'PUT', headers: { 'content-type': 'image/png' }, body: blob });
      return put.ok ? key : null;
    } catch {
      return null;
    }
  }

  async function handleSave(name: string, occasion: string) {
    setSaving(true);
    let coverKey: string | null = null;
    try {
      const blob = await composeCover(placed);
      if (blob) coverKey = await uploadCover(blob);
    } catch {
      coverKey = null;
    }

    const payload: Record<string, unknown> = {
      name: name.length > 0 ? name : null,
      occasion: occasion.length > 0 ? occasion : null,
      items: placed.map((p) => ({
        itemId: p.itemId,
        layerOrder: p.layerOrder,
        posX: clamp(p.posX, 0, 1),
        posY: clamp(p.posY, 0, 1),
        scale: p.scale,
        rotation: p.rotation,
      })),
    };
    if (coverKey) payload.coverImagePath = coverKey;

    try {
      const res = await fetch(outfitId ? `/api/outfits/${outfitId}` : '/api/outfits', {
        method: outfitId ? 'PATCH' : 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error('save failed');
      // First saved look (built by hand in the canvas). Only a brand-new save
      // (POST, not an edit PATCH) is an activation moment; deduped per user.
      if (!outfitId) {
        trackFirstOnce('first_outfit_saved', session?.user?.id, { via: 'canvas' });
      }
      setSaving(false);
      setSaveOpen(false);
      setToast(strings.design.outfitSaved);
      setTimeout(() => router.push('/design'), 900);
    } catch {
      setSaving(false);
      setToast(strings.errors.generic);
    }
  }

  const selected = selectedId ? (placed.find((p) => p.itemId === selectedId) ?? null) : null;
  const maxLayer = placed.reduce((max, p) => Math.max(max, p.layerOrder), -1);
  const minLayer = placed.reduce((min, p) => Math.min(min, p.layerOrder), Number.POSITIVE_INFINITY);

  return (
    <main style={rootStyle}>
      <header style={topBarStyle}>
        <button type="button" aria-label={strings.common.cancel} style={iconBtnStyle} onClick={() => router.push('/design')}>
          <span aria-hidden="true">←</span>
        </button>
        <button
          type="button"
          style={{ ...saveBtnStyle, opacity: placed.length === 0 ? 0.5 : 1, cursor: placed.length === 0 ? 'not-allowed' : 'pointer' }}
          disabled={placed.length === 0}
          onClick={() => setSaveOpen(true)}
        >
          <Text variant="ui" size="subhead" weight={700} style={{ color: 'var(--color-ink)' }}>
            {strings.design.saveOutfit}
          </Text>
        </button>
      </header>

      <CanvasStage placed={placed} selectedId={selectedId} onSelect={setSelectedId} onCommit={commitPos} />

      <div style={controlSlotStyle}>
        <AnimatePresence>
          {selected ? (
            <ItemControlBar
              key={selected.itemId}
              piece={selected}
              atFront={selected.layerOrder === maxLayer}
              atBack={selected.layerOrder === minLayer}
              onScale={(scale) => patchPiece(selected.itemId, { scale })}
              onRotate={(rotation) => patchPiece(selected.itemId, { rotation })}
              onForward={() => restack(selected.itemId, 1)}
              onBackward={() => restack(selected.itemId, -1)}
              onRemove={() => removePiece(selected.itemId)}
            />
          ) : null}
        </AnimatePresence>
      </div>

      <div style={drawerSpacerStyle} />

      <ClosetDrawer items={items} placedIds={placedIds} onAdd={addItem} />

      <AnimatePresence>
        {saveOpen ? (
          <SaveOutfitSheet
            initialName={prefill.name}
            initialOccasion={prefill.occasion}
            saving={saving}
            onSave={handleSave}
            onCancel={() => setSaveOpen(false)}
          />
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {toast ? (
          <motion.div
            key={toast}
            role="status"
            style={toastStyle}
            initial={{ opacity: 0, x: '-50%', y: reduced ? 0 : 8 }}
            animate={{ opacity: 1, x: '-50%', y: 0 }}
            exit={{ opacity: 0, x: '-50%', y: reduced ? 0 : 8 }}
            transition={transitionFor(motionToken.springs.gentle, reduced)}
          >
            <Text variant="ui" size="footnote" style={{ color: 'var(--color-text)' }}>
              {toast}
            </Text>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </main>
  );
}
