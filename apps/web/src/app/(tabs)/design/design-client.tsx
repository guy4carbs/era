'use client';

import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { layout, motion as motionToken, typeRamp } from '@era/tokens';
import { Text } from '../../../components/Text';
import { strings } from '@era/core/strings';
import { suggestForDesign } from '@era/core/ovi';
import { Button, FailedLoad } from '../../../components';
import {
  EraAssignSheet,
  EraList,
  OutfitGrid,
  type EraSummary,
  type OutfitSummary,
} from '../../../components/design';
import { OviLoader, OviSuggestionHost, OviToast, TOAST_DISMISS_MS } from '../../../components/ovi';
import { toOviItems, type OviItemSource } from '../../../components/ovi/to-ovi-items';
import { viewTransition } from '../../../lib/motion';
import { PageHeader } from '../../../components/PageHeader';
import { useSession } from '../../../lib/auth-client';

const screenStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  paddingBlock: 'var(--space-8)',
};

// The gapped section stack beneath the header (D6 52px section rhythm). The
// PageHeader owns its own 32px air below, so it sits outside this stack.
const sectionsStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--rhythm-section-above)',
};

const emptyWrapStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-4)',
  alignItems: 'flex-start',
};

const emptyTitleStyle: CSSProperties = {
  margin: 0,
};

const emptyBodyStyle: CSSProperties = {
  margin: 0,
  color: 'var(--color-secondary-strong)',
};

const signInRowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 'var(--space-4)',
  minHeight: 'var(--touch-target-min)',
};

// Build pill: bottom-LEFT at Ovi's height (Ovi owns the circular FAB right),
// mirroring the closet add pill; positioning + rail offset live in the class.
const buildPillStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 'var(--space-2)',
  minHeight: 'var(--touch-target-min)',
  paddingInline: 'var(--space-4)',
  borderRadius: 'var(--radius-hero)',
  border: 'none',
  cursor: 'pointer',
  background: 'var(--color-accent)',
  color: 'var(--color-ink)',
  fontSize: typeRamp.subhead.rem,
  fontWeight: 700,
  boxShadow: 'var(--shadow-e2)',
};

const buildPillCss = [
  `.era-build-pill{position:fixed;left:var(--space-4);bottom:calc(var(--tabbar-height) + var(--space-4) + env(safe-area-inset-bottom));z-index:60}`,
  `@media(min-width:${layout.breakpoints.lg}px){.era-build-pill{left:calc(var(--rail-width) + var(--space-4))}}`,
].join('\n');


/** Accent build pill that opens a fresh canvas. */
function BuildPill({ onClick }: { onClick: () => void }) {
  const reduced = useReducedMotion();
  return (
    <motion.button
      type="button"
      className="era-build-pill"
      aria-label={strings.design.newOutfit}
      style={buildPillStyle}
      whileHover={reduced ? undefined : { boxShadow: 'var(--shadow-e3)' }}
      whileTap={reduced ? undefined : { scale: motionToken.press.scale }}
      onClick={onClick}
    >
      <span aria-hidden="true">+</span>
      {strings.design.newOutfit}
    </motion.button>
  );
}

/**
 * The Design tab. Signed-out visitors get a sign-in nudge. Signed-in, it lists
 * saved outfits (empty state sells the first build) and the user's eras, and
 * hosts the "add to an era" flow. Building or reopening an outfit hands off to
 * the full-screen canvas route.
 */
/**
 * `feedEnabled` arrives from the server `page.tsx` (authoritative
 * `ERA_FEED_ENABLED`, read per request) and gates the share-to-feed buttons —
 * never a build-time-inlined `NEXT_PUBLIC_*` read in client code.
 */
export function DesignScreen({ feedEnabled }: { feedEnabled: boolean }) {
  const router = useRouter();
  const { data: session, isPending } = useSession();

  const [outfits, setOutfits] = useState<OutfitSummary[] | null>(null);
  const [eras, setEras] = useState<EraSummary[] | null>(null);
  const [items, setItems] = useState<OviItemSource[] | null>(null);
  const [assignTarget, setAssignTarget] = useState<OutfitSummary | null>(null);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);

  const loadOutfits = useCallback(async () => {
    try {
      const res = await fetch('/api/outfits');
      if (!res.ok) throw new Error('outfits fetch failed');
      const body = (await res.json()) as { outfits: OutfitSummary[] };
      setOutfits(body.outfits);
      setLoadFailed(false);
    } catch {
      // The outfits list is the surface's primary data — a failure here is a
      // page-level load failure, surfaced as the editorial failed-load state
      // (not silently degraded to empty, which would read as "no looks yet").
      setOutfits([]);
      setLoadFailed(true);
    }
  }, []);

  const loadEras = useCallback(async () => {
    try {
      const res = await fetch('/api/eras');
      if (!res.ok) throw new Error('eras fetch failed');
      const body = (await res.json()) as { eras: EraSummary[] };
      setEras(body.eras);
    } catch {
      setEras([]);
    }
  }, []);

  // The closet, read only to power Ovi's ambient "starting point" invitation —
  // the same /api/items every closet surface already hits, no new route.
  const loadItems = useCallback(async () => {
    try {
      const res = await fetch('/api/items');
      if (!res.ok) throw new Error('items fetch failed');
      const body = (await res.json()) as { items: OviItemSource[] };
      setItems(body.items);
    } catch {
      setItems([]);
    }
  }, []);

  const reloadAll = useCallback(() => {
    void loadOutfits();
    void loadEras();
    void loadItems();
  }, [loadOutfits, loadEras, loadItems]);

  useEffect(() => {
    if (isPending || !session) return;
    reloadAll();
  }, [isPending, session, reloadAll]);

  useEffect(() => {
    if (!toast) return;
    const handle = setTimeout(() => setToast(null), TOAST_DISMISS_MS);
    return () => clearTimeout(handle);
  }, [toast]);

  // Ovi's open invitation: only speaks when the closet can actually deliver a
  // starting point (a look composes). No profile on this surface → null, honestly.
  const designSuggestion = useMemo(
    () => (items && items.length > 0 ? suggestForDesign(toOviItems(items), null) : null),
    [items],
  );

  function openCanvas(outfitId?: string) {
    viewTransition(() =>
      router.push(outfitId ? `/design/canvas?outfit=${outfitId}` : '/design/canvas'),
    );
  }

  async function createEra(title: string, description: string) {
    setBusy(true);
    try {
      const res = await fetch('/api/eras', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ title, description: description.length > 0 ? description : undefined }),
      });
      if (!res.ok) throw new Error('era create failed');
      await loadEras();
      setToast(strings.design.eraCreated);
    } catch {
      setToast(strings.errors.generic);
    } finally {
      setBusy(false);
    }
  }

  async function linkOutfit(eraId: string, outfitId: string) {
    const res = await fetch(`/api/eras/${eraId}/outfits`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ outfitId }),
    });
    if (!res.ok) throw new Error('assign failed');
  }

  async function assignExisting(eraId: string) {
    if (!assignTarget) return;
    setBusy(true);
    try {
      await linkOutfit(eraId, assignTarget.id);
      await loadEras();
      setAssignTarget(null);
      setToast(strings.design.addedToEra);
    } catch {
      setToast(strings.errors.generic);
    } finally {
      setBusy(false);
    }
  }

  async function createEraAndAssign(title: string, description: string) {
    if (!assignTarget) return;
    setBusy(true);
    try {
      const res = await fetch('/api/eras', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ title, description: description.length > 0 ? description : undefined }),
      });
      if (!res.ok) throw new Error('era create failed');
      const body = (await res.json()) as { era: { id: string } };
      await linkOutfit(body.era.id, assignTarget.id);
      await loadEras();
      setAssignTarget(null);
      setToast(strings.design.addedToEra);
    } catch {
      setToast(strings.errors.generic);
    } finally {
      setBusy(false);
    }
  }

  // Signed out: mirror the closet's sign-in affordance.
  if (!isPending && !session) {
    return (
      <main style={screenStyle}>
        <PageHeader title="Design" subtitle={strings.design.subtitle} />
        <div style={signInRowStyle}>
          <Text variant="caption" style={{ color: 'var(--color-secondary-strong)' }}>
            {strings.design.tabEmptyBody}
          </Text>
          <Link href="/sign-in" style={{ textDecoration: 'none' }}>
            <Text variant="ui" as="span" style={{ color: 'var(--color-accent)' }}>
              Sign in →
            </Text>
          </Link>
        </div>
      </main>
    );
  }

  if (isPending || outfits === null || eras === null) {
    return (
      <main style={screenStyle}>
        <PageHeader title="Design" subtitle={strings.design.subtitle} />
        <OviLoader variant="page" label={strings.design.subtitle} />
      </main>
    );
  }

  if (loadFailed) {
    return (
      <main style={screenStyle}>
        <PageHeader title="Design" subtitle={strings.design.subtitle} />
        <FailedLoad onRetry={reloadAll} />
      </main>
    );
  }

  return (
    <main style={screenStyle}>
      <style>{buildPillCss}</style>
      <PageHeader title="Design" subtitle={strings.design.subtitle} />

      {/* Ovi's ambient invitation: one strip below the header, in normal flow so it
          never overlaps the grid or the build pill. Silent unless a look composes. */}
      <OviSuggestionHost suggestion={designSuggestion} />

      <div style={sectionsStyle}>
        {outfits.length === 0 ? (
          <div style={emptyWrapStyle}>
            <Text variant="largeTitle" as="h2" size="title1" style={emptyTitleStyle}>
              {strings.design.tabEmptyTitle}
            </Text>
            <Text variant="body" style={emptyBodyStyle}>{strings.design.tabEmptyBody}</Text>
            <Button variant="primary" onClick={() => openCanvas()}>
              {strings.design.newOutfit}
            </Button>
          </div>
        ) : (
          <OutfitGrid
            outfits={outfits}
            feedEnabled={feedEnabled}
            onOpen={(id) => openCanvas(id)}
            onAssign={setAssignTarget}
          />
        )}

        <EraList eras={eras} creating={busy} feedEnabled={feedEnabled} onCreate={createEra} />
      </div>

      <BuildPill onClick={() => openCanvas()} />

      <AnimatePresence>
        {assignTarget ? (
          <EraAssignSheet
            eras={eras}
            busy={busy}
            onAssignExisting={assignExisting}
            onCreateAndAssign={createEraAndAssign}
            onClose={() => setAssignTarget(null)}
          />
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {toast ? (
          <OviToast
            message={toast}
            variant={toast === strings.errors.generic ? 'error' : 'success'}
          />
        ) : null}
      </AnimatePresence>
    </main>
  );
}
