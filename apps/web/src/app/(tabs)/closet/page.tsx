'use client';

import { useEffect, useState, type CSSProperties } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { motion, useReducedMotion } from 'framer-motion';
import { typeRamp, layout, boxShadows } from '@era/tokens';
import { strings } from '@era/core/strings';
import { ClosetEmpty, ClosetGallery, type GalleryItem } from '../../../components/closet';
import { useSession } from '../../../lib/auth-client';

const screenStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-6)',
  paddingBlock: 'var(--space-8)',
};

const titleStyle: CSSProperties = {
  margin: 0,
  fontSize: typeRamp.largeTitle.rem,
  lineHeight: `${typeRamp.largeTitle.lineHeight}px`,
  fontWeight: 700,
};

const secondaryTextStyle: CSSProperties = {
  margin: 0,
  color: 'var(--color-secondary-strong)',
  fontSize: typeRamp.body.rem,
};

const signInRowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 'var(--space-4)',
  minHeight: 'var(--touch-target-min)',
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
  boxShadow: boxShadows.e2,
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
      whileHover={reduced ? undefined : { boxShadow: boxShadows.e3 }}
      whileTap={reduced ? undefined : { scale: 0.96 }}
      onClick={onClick}
    >
      <span aria-hidden="true">+</span>
      {strings.closet.addCta}
    </motion.button>
  );
}

/**
 * The Closet tab. Signed-out visitors get a sign-in nudge (the closet is a
 * per-user surface). Signed-in, it fetches the user's items: an empty closet
 * sells both import paths, a stocked one renders the premium 2.5D gallery with a
 * floating add pill. Archive/edit mutations update the list in place.
 */
export default function ClosetPage() {
  const router = useRouter();
  const { data: session, isPending } = useSession();
  const [items, setItems] = useState<GalleryItem[] | null>(null);

  useEffect(() => {
    if (isPending || !session) return;
    let active = true;
    void (async () => {
      try {
        const res = await fetch('/api/items');
        if (!res.ok) throw new Error('items fetch failed');
        const body = (await res.json()) as { items: GalleryItem[] };
        if (active) setItems(body.items);
      } catch {
        if (active) setItems([]);
      }
    })();
    return () => {
      active = false;
    };
  }, [isPending, session]);

  function openAdd() {
    router.push('/closet/add');
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
        <h1 style={titleStyle}>Closet</h1>
        <div style={signInRowStyle}>
          <span style={{ color: 'var(--color-secondary-strong)', fontSize: typeRamp.footnote.rem }}>
            {strings.closet.empty}
          </span>
          <Link className="link" href="/sign-in">
            Sign in →
          </Link>
        </div>
      </main>
    );
  }

  // Session resolving or items still loading.
  if (isPending || items === null) {
    return (
      <main style={screenStyle}>
        <h1 style={titleStyle}>Closet</h1>
        <p style={secondaryTextStyle}>Loading…</p>
      </main>
    );
  }

  if (items.length === 0) {
    return (
      <main style={screenStyle}>
        <h1 style={titleStyle}>Closet</h1>
        <ClosetEmpty onAddPhoto={openAdd} onAddLink={openAdd} />
      </main>
    );
  }

  return (
    <main>
      <style>{addPillCss}</style>
      <ClosetGallery items={items} onArchived={handleArchived} onUpdated={handleUpdated} />
      <AddPill onClick={openAdd} />
    </main>
  );
}
