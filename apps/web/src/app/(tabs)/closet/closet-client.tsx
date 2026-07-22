'use client';

import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { motion, useReducedMotion } from 'motion/react';
import { typeRamp, layout, motion as motionToken } from '@era/tokens';
import { strings } from '@era/core/strings';
import { suggestForCloset } from '@era/core/ovi';
import { ClosetEmpty, ClosetGallery, SettingsLink, type GalleryItem } from '../../../components/closet';
import { OviSuggestionHost } from '../../../components/ovi';
import { toOviItems } from '../../../components/ovi/to-ovi-items';
import { FailedLoad } from '../../../components/FailedLoad';
import { PageHeader } from '../../../components/PageHeader';
import { SkeletonGrid } from '../../../components/Skeleton';
import { Text } from '../../../components/Text';
import { viewTransition } from '../../../lib/motion';
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

const signInRowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 'var(--space-4)',
  minHeight: 'var(--touch-target-min)',
};

// Empty-closet: the settings gear sits right-aligned above the import prompt.
const emptyActionsStyle: CSSProperties = {
  display: 'flex',
  justifyContent: 'flex-end',
};

// Add is a labeled pill floating bottom-LEFT at Ovi's height (Ovi owns the sole
// circular FAB bottom-right). Positioning + the rail offset live in
// `.era-add-pill` so the media query can read the token breakpoint.
const addPillStyle: CSSProperties = {
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

const addPillCss = [
  `.era-add-pill{position:fixed;left:var(--space-4);bottom:calc(var(--tabbar-height) + var(--space-4) + env(safe-area-inset-bottom));z-index:60}`,
  `@media(min-width:${layout.breakpoints.lg}px){.era-add-pill{left:calc(var(--rail-width) + var(--space-4))}}`,
].join('\n');

/** Labeled accent pill (bottom-left) that opens the add-item flow. */
function AddPill({ onClick }: { onClick: () => void }) {
  const reduced = useReducedMotion();
  return (
    <motion.button
      type="button"
      className="era-add-pill"
      aria-label={strings.closet.addCta}
      style={addPillStyle}
      whileHover={reduced ? undefined : { boxShadow: 'var(--shadow-e3)' }}
      whileTap={reduced ? undefined : { scale: motionToken.press.scale }}
      onClick={onClick}
    >
      <span aria-hidden="true">+</span>
      {strings.closet.addCta}
    </motion.button>
  );
}

/**
 * The Closet tab's client body. Signed-out visitors get a sign-in nudge (the
 * closet is a per-user surface). Signed-in, it fetches the user's items: an empty
 * closet sells both import paths, a stocked one renders the premium 2.5D gallery
 * with a floating add pill. Archive/edit mutations update the list in place.
 *
 * `turnaroundEnabled` arrives as a prop from the server `page.tsx`, which reads
 * the AUTHORITATIVE `ERA_TURNAROUND_ENABLED` at REQUEST time — never a
 * `NEXT_PUBLIC_*` var here (those inline at BUILD time, so a Railway flag flip on
 * an env-only redeploy silently stays off — the trap that bit /plus, the sitemap,
 * and /feed). It threads down to the detail sheet's angle-viewer flow.
 */
export function ClosetScreen({ turnaroundEnabled }: { turnaroundEnabled: boolean }) {
  const router = useRouter();
  const { data: session, isPending } = useSession();
  const [items, setItems] = useState<GalleryItem[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  // Bumping this re-runs the fetch effect — the failed-load retry handle.
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (isPending || !session) return;
    let active = true;
    void (async () => {
      try {
        const res = await fetch('/api/items');
        if (!res.ok) throw new Error('items fetch failed');
        const body = (await res.json()) as { items: GalleryItem[] };
        if (active) {
          setItems(body.items);
          setLoadFailed(false);
        }
      } catch {
        // Don't degrade a failure to empty — an empty closet is an invitation,
        // a failed fetch is an error. Surface the editorial failed-load state.
        if (active) {
          setItems([]);
          setLoadFailed(true);
        }
      }
    })();
    return () => {
      active = false;
    };
  }, [isPending, session, reloadKey]);

  // Ovi's ambient closet strip: a real, buildable, untried look from owned pieces.
  // Profile/wearLogs aren't fetched on this screen, so we pass null/[] honestly —
  // the composer degrades to a less style-specific pick, never a fabricated one.
  const closetSuggestion = useMemo(
    () => (items && items.length > 0 ? suggestForCloset(toOviItems(items), null, []) : null),
    [items],
  );

  function openAdd() {
    viewTransition(() => router.push('/closet/add'));
  }

  function handleArchived(id: string) {
    setItems((prev) => (prev ? prev.filter((item) => item.id !== id) : prev));
  }

  function handleUpdated(updated: GalleryItem) {
    setItems((prev) =>
      prev ? prev.map((item) => (item.id === updated.id ? updated : item)) : prev,
    );
  }

  // Signed out: mirror the feed's sign-in affordance.
  if (!isPending && !session) {
    return (
      <main style={screenStyle}>
        <PageHeader title="Closet" subtitle={strings.closet.subtitle} />
        <div style={signInRowStyle}>
          <Text variant="caption" style={{ color: 'var(--color-secondary-strong)' }}>
            {strings.closet.empty}
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

  // Session resolving or items still loading.
  if (isPending || items === null) {
    return (
      <main style={screenStyle}>
        <PageHeader title="Closet" subtitle={strings.closet.subtitle} />
        {/* The closet deserves skeletons, not a spinner: warm-cream 4:5 card
            placeholders shimmering in the grid shape the real gallery will fill.
            A status live region names the wait for assistive tech; the tiles
            themselves are aria-hidden inside SkeletonGrid. */}
        <div role="status" aria-busy="true" aria-label={strings.closet.subtitle}>
          <SkeletonGrid count={6} />
        </div>
      </main>
    );
  }

  // A failed fetch is an error (retry), never the empty invitation below.
  if (loadFailed) {
    return (
      <main style={screenStyle}>
        <PageHeader title="Closet" subtitle={strings.closet.subtitle} />
        <FailedLoad onRetry={() => setReloadKey((k) => k + 1)} />
      </main>
    );
  }

  if (items.length === 0) {
    return (
      <main style={screenStyle}>
        <PageHeader title="Closet" subtitle={strings.closet.subtitle} />
        <div style={sectionsStyle}>
          {/* New users still need a way into account controls before adding a piece. */}
          <div style={emptyActionsStyle}>
            <SettingsLink />
          </div>
          <ClosetEmpty onAddPhoto={openAdd} />
        </div>
      </main>
    );
  }

  return (
    <main>
      <style>{addPillCss}</style>
      {/* Ovi's ambient presence: one strip above the gallery, in normal flow so it
          never overlaps the tiles or the add pill. It reserves its own space only
          after the settle delay, and stays dismissed once waved off. */}
      <OviSuggestionHost suggestion={closetSuggestion} />
      <ClosetGallery
        items={items}
        turnaroundEnabled={turnaroundEnabled}
        onArchived={handleArchived}
        onUpdated={handleUpdated}
      />
      <AddPill onClick={openAdd} />
    </main>
  );
}
