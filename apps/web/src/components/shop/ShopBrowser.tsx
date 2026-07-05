'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { motion as motionToken, layout, typeRamp } from '@era/tokens';
import { strings } from '@era/core/strings';
import type { RankedProduct } from '@era/core/shop';
import { transitionFor } from '../../lib/motion';
import { rankProducts, searchProducts } from '../../lib/shop-client';
import { ShopCard } from './ShopCard';
import {
  EMPTY_FILTERS,
  ShopFilters,
  queryFromFilters,
  type ShopFilterState,
} from './ShopFilters';

/** Where the browse pipeline is: first load, settled, or errored. */
type Status = 'loading' | 'ready' | 'error';

// Responsive grid: 2 up on phones widening to 4 in the container. Media queries
// can't read CSS vars, so the rule is built from the token breakpoints + gutter.
const gridCss = [
  `.era-shop-grid{display:grid;gap:${layout.grid.gutter}px;grid-template-columns:repeat(2,minmax(0,1fr))}`,
  `@media(min-width:${layout.breakpoints.md}px){.era-shop-grid{grid-template-columns:repeat(3,minmax(0,1fr))}}`,
  `@media(min-width:${layout.breakpoints.lg}px){.era-shop-grid{grid-template-columns:repeat(4,minmax(0,1fr))}}`,
].join('\n');

/**
 * The Shop tab. Full-screen, browsable, honest.
 *
 * Flow, on load and on every filter change: `shop-search` returns a raw page,
 * then `rank-products` scores that page against the user's closet — the grid
 * renders those {@link RankedProduct}s in fit order (the route sorts; we preserve
 * it, appending later pages beneath earlier ones). "Load more" pulls the next
 * page through the same two hops. The affiliate disclosure and the trust-frame
 * intro sit visibly at the top the whole time; the sort is fixed to
 * "Best fit for your closet" and named so the ranking stays legible.
 */
export function ShopBrowser() {
  const reduced = useReducedMotion();
  const [filters, setFilters] = useState<ShopFilterState>(EMPTY_FILTERS);
  const [products, setProducts] = useState<RankedProduct[]>([]);
  const [status, setStatus] = useState<Status>('loading');
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [dismissed, setDismissed] = useState<ReadonlySet<string>>(() => new Set());

  // Guards against out-of-order responses when filters change quickly: only the
  // latest request is allowed to write state.
  const requestId = useRef(0);

  const load = useCallback(
    async (targetPage: number, mode: 'replace' | 'append') => {
      const id = ++requestId.current;
      if (mode === 'replace') {
        setStatus('loading');
      } else {
        setLoadingMore(true);
      }
      try {
        const result = await searchProducts({ ...queryFromFilters(filters), page: targetPage });
        const ranked = await rankProducts(result.products);
        if (id !== requestId.current) return; // a newer request superseded this one
        setProducts((prev) => (mode === 'append' ? [...prev, ...ranked] : ranked));
        setPage(result.page);
        setHasMore(result.hasMore);
        setStatus('ready');
      } catch {
        if (id !== requestId.current) return;
        // Append failures leave the current grid intact; a first-load failure is
        // the only one that owns the whole error surface.
        if (mode === 'replace') setStatus('error');
      } finally {
        if (id === requestId.current) setLoadingMore(false);
      }
    },
    [filters],
  );

  // Initial load + re-query whenever the filters change.
  useEffect(() => {
    void load(1, 'replace');
  }, [load]);

  function handleDismiss(productId: string) {
    setDismissed((prev) => new Set(prev).add(productId));
  }

  const visible = useMemo(
    () => products.filter((p) => !dismissed.has(p.id)),
    [products, dismissed],
  );

  return (
    <main style={screenStyle}>
      <style>{gridCss}</style>

      <header style={headerStyle}>
        <h1 style={titleStyle}>{strings.shop.title}</h1>
        <p style={introStyle}>{strings.shop.intro}</p>
        {/* Affiliate disclosure — VISIBLE at the top of the tab at all times
            (Shield/Ledger require it present and legible). */}
        <p style={disclosureStyle}>{strings.shop.affiliateDisclosure}</p>
      </header>

      <ShopFilters filters={filters} onChange={setFilters} />

      {status !== 'error' ? (
        <p style={sortStyle}>{strings.shop.sortRelevance}</p>
      ) : null}

      <Body
        status={status}
        visible={visible}
        hasMore={hasMore}
        loadingMore={loadingMore}
        reduced={reduced}
        onDismiss={handleDismiss}
        onLoadMore={() => void load(page + 1, 'append')}
        onRetry={() => void load(1, 'replace')}
      />
    </main>
  );
}

interface BodyProps {
  status: Status;
  visible: RankedProduct[];
  hasMore: boolean;
  loadingMore: boolean;
  reduced: boolean | null;
  onDismiss: (productId: string) => void;
  onLoadMore: () => void;
  onRetry: () => void;
}

/** The state-dependent body: loading / error / empty / the grid + load-more. */
function Body({
  status,
  visible,
  hasMore,
  loadingMore,
  reduced,
  onDismiss,
  onLoadMore,
  onRetry,
}: BodyProps) {
  if (status === 'loading') {
    return <p style={noticeStyle}>{strings.shop.loading}</p>;
  }

  if (status === 'error') {
    return (
      <div style={noticeColumnStyle}>
        <p style={noticeStyle}>{strings.shop.error}</p>
        <button type="button" style={retryStyle} onClick={onRetry}>
          {strings.errors.retry}
        </button>
      </div>
    );
  }

  if (visible.length === 0) {
    return <p style={noticeStyle}>{strings.shop.empty}</p>;
  }

  return (
    <>
      <div className="era-shop-grid">
        <AnimatePresence mode="popLayout">
          {visible.map((product) => (
            <motion.div
              key={product.id}
              layout
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={transitionFor(motionToken.springs.gentle, reduced)}
            >
              <ShopCard product={product} onDismiss={onDismiss} />
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {hasMore ? (
        <button type="button" style={loadMoreStyle} onClick={onLoadMore} disabled={loadingMore}>
          {loadingMore ? strings.shop.loading : strings.shop.loadMore}
        </button>
      ) : null}
    </>
  );
}

const screenStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-6)',
  paddingBlock: 'var(--space-8)',
};

const headerStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-2)',
};

const titleStyle: CSSProperties = {
  margin: 0,
  fontSize: typeRamp.largeTitle.rem,
  lineHeight: `${typeRamp.largeTitle.lineHeight}px`,
  fontWeight: 700,
};

const introStyle: CSSProperties = {
  margin: 0,
  fontSize: typeRamp.body.rem,
  lineHeight: `${typeRamp.body.lineHeight}px`,
  color: 'var(--color-text)',
};

// Disclosure copy is legal/disclosure text at >=17pt, so `secondary` clears its
// large-text contrast gate; keep it at body size, never smaller.
const disclosureStyle: CSSProperties = {
  margin: 0,
  fontSize: typeRamp.body.rem,
  lineHeight: `${typeRamp.body.lineHeight}px`,
  color: 'var(--color-secondary)',
};

const sortStyle: CSSProperties = {
  margin: 0,
  fontSize: typeRamp.footnote.rem,
  fontWeight: 600,
  color: 'var(--color-secondary-strong)',
};

const noticeStyle: CSSProperties = {
  margin: 0,
  fontSize: typeRamp.body.rem,
  color: 'var(--color-secondary-strong)',
};

const noticeColumnStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'flex-start',
  gap: 'var(--space-3)',
};

const retryStyle: CSSProperties = {
  border: 'none',
  background: 'transparent',
  padding: 0,
  cursor: 'pointer',
  fontSize: typeRamp.subhead.rem,
  fontWeight: 600,
  color: 'var(--color-accent)',
};

const loadMoreStyle: CSSProperties = {
  alignSelf: 'center',
  minHeight: 'var(--touch-target-web)',
  paddingInline: 'var(--space-6)',
  borderRadius: 'var(--radius-hero)',
  border: '1px solid var(--color-hairline)',
  background: 'var(--color-surface)',
  color: 'var(--color-text)',
  cursor: 'pointer',
  fontSize: typeRamp.subhead.rem,
  fontWeight: 600,
};
