'use client';

import { useEffect, useState, type CSSProperties } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { motion, useReducedMotion } from 'framer-motion';
import { typeRamp, layout, boxShadows } from '@era/tokens';
import { strings } from '@era/core/strings';
import { Button } from '../../../components';
import { ItemCard, type ItemWithDisplay } from '../../../components/items';
import { useSession } from '../../../lib/auth-client';

const screenStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-6)',
  paddingBlock: 'var(--space-8)',
};

const titleStyle: CSSProperties = {
  margin: 0,
  fontSize: typeRamp.title1.rem,
  lineHeight: `${typeRamp.title1.lineHeight}px`,
  fontWeight: 700,
};

const secondaryTextStyle: CSSProperties = {
  margin: 0,
  color: 'var(--color-secondary)',
  fontSize: typeRamp.body.rem,
};

const emptyColumnStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'flex-start',
  gap: 'var(--space-6)',
};

const signInRowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 'var(--space-4)',
  minHeight: 'var(--touch-target-min)',
};

// Add is a labeled pill, NOT a second circle above Ovi — Ovi owns the sole
// circular FAB bottom-right. The pill floats bottom-LEFT (matching mobile);
// positioning + the rail offset live in `.era-add-pill` (below) so the media
// query can read the token breakpoint. This constant is visual only.
const addPillStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 'var(--space-2)',
  minHeight: 'var(--touch-target-min)',
  paddingInline: 'var(--space-4)',
  borderRadius: '999px',
  border: 'none',
  cursor: 'pointer',
  background: 'var(--color-accent)',
  color: 'var(--color-ink)',
  fontSize: typeRamp.subhead.rem,
  fontWeight: 700,
  boxShadow: boxShadows.e2,
};

// Bottom-left, at Ovi's vertical height. Below lg the left edge is free; at ≥lg
// the left rail owns that edge, so shift the pill past `--rail-width`.
const addPillCss = [
  `.era-add-pill{position:fixed;left:var(--space-4);bottom:calc(var(--tabbar-height) + var(--space-4) + env(safe-area-inset-bottom));z-index:60}`,
  `@media(min-width:${layout.breakpoints.lg}px){.era-add-pill{left:calc(var(--rail-width) + var(--space-4))}}`,
].join('\n');

// Responsive column count — media queries can't read CSS vars, so build the
// rule from the token breakpoints and gutter. 2 up on phones, widening to 5 on
// the largest screens inside the 1200 container.
const gridCss = [
  `.era-closet-grid{display:grid;gap:${layout.grid.gutter}px;grid-template-columns:repeat(2,minmax(0,1fr))}`,
  `@media(min-width:${layout.breakpoints.md}px){.era-closet-grid{grid-template-columns:repeat(3,minmax(0,1fr))}}`,
  `@media(min-width:${layout.breakpoints.lg}px){.era-closet-grid{grid-template-columns:repeat(4,minmax(0,1fr))}}`,
  `@media(min-width:${layout.breakpoints.xl}px){.era-closet-grid{grid-template-columns:repeat(5,minmax(0,1fr))}}`,
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
 * shows the warm empty line plus an add button, while a stocked one renders the
 * gallery grid with a floating add button. Unconfirmed items carry the "tap to
 * confirm" dot and resume straight into the add flow.
 */
export default function ClosetPage() {
  const router = useRouter();
  const { data: session, isPending } = useSession();
  const [items, setItems] = useState<ItemWithDisplay[] | null>(null);

  useEffect(() => {
    if (isPending || !session) return;
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
  }, [isPending, session]);

  function openAdd() {
    router.push('/closet/add');
  }

  function handleItemTap(item: ItemWithDisplay) {
    // Unconfirmed items resume into the confirm screen; confirmed are inert here.
    if (!item.tagsConfirmed) router.push(`/closet/add?item=${item.id}`);
  }

  // Signed out: mirror the feed's sign-in affordance.
  if (!isPending && !session) {
    return (
      <main style={screenStyle}>
        <h1 style={titleStyle}>Closet</h1>
        <div style={signInRowStyle}>
          <span style={{ color: 'var(--color-secondary)', fontSize: typeRamp.footnote.rem }}>
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
        <div style={emptyColumnStyle}>
          <p style={secondaryTextStyle}>{strings.closet.empty}</p>
          <Button variant="primary" onClick={openAdd}>
            {strings.closet.addCta}
          </Button>
        </div>
      </main>
    );
  }

  return (
    <main style={screenStyle}>
      <style>{`${gridCss}\n${addPillCss}`}</style>
      <h1 style={titleStyle}>Closet</h1>
      <div className="era-closet-grid">
        {items.map((item) => (
          <ItemCard key={item.id} item={item} onClick={() => handleItemTap(item)} />
        ))}
      </div>
      <AddPill onClick={openAdd} />
    </main>
  );
}
