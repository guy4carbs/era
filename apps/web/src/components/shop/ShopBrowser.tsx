'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { motion as motionToken, layout } from '@era/tokens';
import { Text } from '../Text';
import { strings } from '@era/core/strings';
import type { RankedProduct, WardrobeGap } from '@era/core/shop';
import { pressProps, transitionFor, useStagger } from '../../lib/motion';
import {
  listSaved,
  rankProducts,
  saveProduct,
  searchProducts,
  unsaveProduct,
  type SavedShopProduct,
} from '../../lib/shop-client';
import { GapsHero } from './GapsHero';
import { ShopCard } from './ShopCard';
import {
  EMPTY_FILTERS,
  ShopFilters,
  filtersFromQuery,
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
  // Wishlist: the id set drives each card's filled-heart state; the product list
  // backs the Saved view. Hydrated once on mount, parallel to the browse load.
  const [saved, setSaved] = useState<ReadonlySet<string>>(() => new Set());
  const [savedProducts, setSavedProducts] = useState<SavedShopProduct[]>([]);
  const [view, setView] = useState<'browse' | 'saved'>('browse');

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

  // Hydrate the wishlist once. Additive and non-blocking: a failure just leaves
  // the Saved view empty rather than surfacing an error over the browse grid.
  useEffect(() => {
    let active = true;
    listSaved()
      .then((products) => {
        if (!active) return;
        setSavedProducts(products);
        setSaved(new Set(products.map((p) => p.id)));
      })
      .catch(() => {
        /* wishlist stays empty; the browse grid is unaffected */
      });
    return () => {
      active = false;
    };
  }, []);

  function handleDismiss(productId: string) {
    setDismissed((prev) => new Set(prev).add(productId));
  }

  // Optimistic wishlist writes: flip local state immediately, then reconcile with
  // the server and revert on failure so the heart never lies about a failed call.
  function handleSave(product: RankedProduct) {
    setSaved((prev) => new Set(prev).add(product.id));
    setSavedProducts((prev) => (prev.some((p) => p.id === product.id) ? prev : [product, ...prev]));
    void saveProduct(product).catch(() => {
      setSaved((prev) => {
        const next = new Set(prev);
        next.delete(product.id);
        return next;
      });
      setSavedProducts((prev) => prev.filter((p) => p.id !== product.id));
    });
  }

  function handleUnsave(product: SavedShopProduct) {
    setSaved((prev) => {
      const next = new Set(prev);
      next.delete(product.id);
      return next;
    });
    setSavedProducts((prev) => prev.filter((p) => p.id !== product.id));
    void unsaveProduct(product.id).catch(() => {
      setSaved((prev) => new Set(prev).add(product.id));
      setSavedProducts((prev) => (prev.some((p) => p.id === product.id) ? prev : [product, ...prev]));
    });
  }

  function handleToggleSave(product: RankedProduct) {
    if (saved.has(product.id)) {
      handleUnsave(product);
    } else {
      handleSave(product);
    }
  }

  // "Fill this gap": fold the gap's pre-filtered query into the Shop filters. That
  // reuses the one filter→query→search path — the `load` effect keyed on `filters`
  // re-runs on its own — so the user lands in a Shop view scoped to the gap's
  // category (and any implied tier), no parallel search.
  function handleFillGap(gap: WardrobeGap) {
    setFilters(filtersFromQuery(gap.suggestedQuery));
  }

  const visible = useMemo(
    () => products.filter((p) => !dismissed.has(p.id)),
    [products, dismissed],
  );

  return (
    <main style={screenStyle}>
      <style>{gridCss}</style>

      <header style={headerStyle}>
        <Text variant="largeTitle" as="h1" weight={700} style={{ margin: 0 }}>{strings.shop.title}</Text>
        <Text variant="body" as="p" style={{ margin: 0, color: 'var(--color-text)' }}>{strings.shop.intro}</Text>
        {/* Affiliate disclosure — VISIBLE at the top of the tab at all times
            (Shield/Ledger require it present and legible). */}
        <Text variant="body" as="p" style={{ margin: 0, color: 'var(--color-secondary)' }}>{strings.shop.affiliateDisclosure}</Text>
      </header>

      <ViewToggle view={view} onChange={setView} />

      {view === 'browse' ? (
        <>
          <GapsHero onFill={handleFillGap} />

          <ShopFilters filters={filters} onChange={setFilters} />

          {status !== 'error' ? (
            <Text variant="ui" as="p" size="footnote" weight={600} style={{ margin: 0, color: 'var(--color-secondary-strong)' }}>{strings.shop.sortRelevance}</Text>
          ) : null}

          <Body
            status={status}
            visible={visible}
            saved={saved}
            hasMore={hasMore}
            loadingMore={loadingMore}
            reduced={reduced}
            onDismiss={handleDismiss}
            onToggleSave={handleToggleSave}
            onLoadMore={() => void load(page + 1, 'append')}
            onRetry={() => void load(1, 'replace')}
          />
        </>
      ) : (
        <SavedView products={savedProducts} reduced={reduced} onUnsave={handleUnsave} />
      )}
    </main>
  );
}

interface ViewToggleProps {
  view: 'browse' | 'saved';
  onChange: (view: 'browse' | 'saved') => void;
}

/**
 * Two-segment control switching the grid between ranked picks and the wishlist.
 * Real buttons with `aria-pressed` (not a tab widget) — each is a toggle whose
 * pressed state is the current view, which is the honest semantic here.
 */
function ViewToggle({ view, onChange }: ViewToggleProps) {
  const reduced = useReducedMotion();
  return (
    <div style={toggleWrapStyle}>
      <motion.button
        type="button"
        style={view === 'browse' ? toggleActiveStyle : toggleStyle}
        aria-pressed={view === 'browse'}
        onClick={() => onChange('browse')}
        {...pressProps(reduced)}
      >
        <Text variant="ui" as="span" size="footnote" weight={600}>{strings.shop.title}</Text>
      </motion.button>
      <motion.button
        type="button"
        style={view === 'saved' ? toggleActiveStyle : toggleStyle}
        aria-pressed={view === 'saved'}
        onClick={() => onChange('saved')}
        {...pressProps(reduced)}
      >
        <Text variant="ui" as="span" size="footnote" weight={600}>{strings.shop.saved.tab}</Text>
      </motion.button>
    </div>
  );
}

interface SavedViewProps {
  products: SavedShopProduct[];
  reduced: boolean | null;
  onUnsave: (product: SavedShopProduct) => void;
}

/** The wishlist grid: same {@link ShopCard} with a filled heart, no dismiss, no why. */
function SavedView({ products, reduced, onUnsave }: SavedViewProps) {
  if (products.length === 0) {
    return <Text variant="body" as="p" style={{ margin: 0, color: 'var(--color-secondary-strong)' }}>{strings.shop.saved.empty}</Text>;
  }

  return (
    <>
      <Text variant="body" as="p" style={{ margin: 0, color: 'var(--color-secondary)' }}>{strings.shop.saved.intro}</Text>
      <div className="era-shop-grid">
        <AnimatePresence mode="popLayout">
          {products.map((product) => (
            <motion.div
              key={product.id}
              layout
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={transitionFor(motionToken.springs.gentle, reduced)}
            >
              <ShopCard product={product} isSaved onToggleSave={() => onUnsave(product)} />
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </>
  );
}

interface BodyProps {
  status: Status;
  visible: RankedProduct[];
  saved: ReadonlySet<string>;
  hasMore: boolean;
  loadingMore: boolean;
  reduced: boolean | null;
  onDismiss: (productId: string) => void;
  onToggleSave: (product: RankedProduct) => void;
  onLoadMore: () => void;
  onRetry: () => void;
}

/** The state-dependent body: loading / error / empty / the grid + load-more. */
function Body({
  status,
  visible,
  saved,
  hasMore,
  loadingMore,
  reduced,
  onDismiss,
  onToggleSave,
  onLoadMore,
  onRetry,
}: BodyProps) {
  if (status === 'loading') {
    return <Text variant="body" as="p" style={{ margin: 0, color: 'var(--color-secondary-strong)' }}>{strings.shop.loading}</Text>;
  }

  if (status === 'error') {
    return (
      <div style={noticeColumnStyle}>
        <Text variant="body" as="p" style={{ margin: 0, color: 'var(--color-secondary-strong)' }}>{strings.shop.error}</Text>
        <motion.button type="button" style={retryStyle} onClick={onRetry} {...pressProps(reduced)}>
          <Text variant="ui" as="span" size="subhead" weight={600} style={{ color: 'var(--color-accent)' }}>{strings.errors.retry}</Text>
        </motion.button>
      </div>
    );
  }

  if (visible.length === 0) {
    return <Text variant="body" as="p" style={{ margin: 0, color: 'var(--color-secondary-strong)' }}>{strings.shop.empty}</Text>;
  }

  return (
    <ResultsGrid
      visible={visible}
      saved={saved}
      reduced={reduced}
      onDismiss={onDismiss}
      onToggleSave={onToggleSave}
      hasMore={hasMore}
      loadingMore={loadingMore}
      onLoadMore={onLoadMore}
    />
  );
}

interface ResultsGridProps {
  visible: RankedProduct[];
  saved: ReadonlySet<string>;
  reduced: boolean | null;
  onDismiss: (productId: string) => void;
  onToggleSave: (product: RankedProduct) => void;
  hasMore: boolean;
  loadingMore: boolean;
  onLoadMore: () => void;
}

/**
 * The ranked results grid + load-more. Split out from Body so it can hold the
 * first-mount stagger guard: the initial page fans in on the token stagger,
 * while dismiss/filter re-renders keep only the AnimatePresence opacity dance
 * (no re-stagger in place — entrances only).
 */
function ResultsGrid({
  visible,
  saved,
  reduced,
  onDismiss,
  onToggleSave,
  hasMore,
  loadingMore,
  onLoadMore,
}: ResultsGridProps) {
  const stagger = useStagger(reduced);
  const didMount = useRef(false);
  const staggerOnMount = !didMount.current;
  useEffect(() => {
    didMount.current = true;
  }, []);

  return (
    <>
      <motion.div
        className="era-shop-grid"
        variants={staggerOnMount ? stagger.container : undefined}
        initial={staggerOnMount ? 'hidden' : false}
        animate={staggerOnMount ? 'visible' : undefined}
      >
        <AnimatePresence mode="popLayout">
          {visible.map((product) => (
            <motion.div
              key={product.id}
              layout
              variants={staggerOnMount ? stagger.item : undefined}
              initial={staggerOnMount ? undefined : { opacity: 0 }}
              animate={staggerOnMount ? undefined : { opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={transitionFor(motionToken.springs.gentle, reduced)}
            >
              <ShopCard
                product={product}
                isSaved={saved.has(product.id)}
                onToggleSave={() => onToggleSave(product)}
                onDismiss={onDismiss}
              />
            </motion.div>
          ))}
        </AnimatePresence>
      </motion.div>

      {hasMore ? (
        <motion.button type="button" style={loadMoreStyle} onClick={onLoadMore} disabled={loadingMore} {...pressProps(reduced, !loadingMore)}>
          <Text variant="ui" as="span" size="subhead" weight={600}>{loadingMore ? strings.shop.loading : strings.shop.loadMore}</Text>
        </motion.button>
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

// Disclosure copy is legal/disclosure text at >=17pt — body size, never smaller.

const toggleWrapStyle: CSSProperties = {
  display: 'inline-flex',
  alignSelf: 'flex-start',
  gap: 'var(--space-1)',
  padding: 'var(--space-1)',
  borderRadius: 'var(--radius-hero)',
  background: 'var(--color-surface)',
  border: '1px solid var(--color-hairline)',
};

const toggleBase: CSSProperties = {
  minHeight: 'var(--touch-target-min)',
  paddingInline: 'var(--space-4)',
  borderRadius: 'var(--radius-hero)',
  border: 'none',
  cursor: 'pointer',
};

const toggleStyle: CSSProperties = {
  ...toggleBase,
  background: 'transparent',
  color: 'var(--color-secondary-strong)',
};

const toggleActiveStyle: CSSProperties = {
  ...toggleBase,
  // Ink label on the accent fill — the highest-contrast pairing, matching the
  // primary Button (part of the audited 15/15 contrast set).
  background: 'var(--color-accent)',
  color: 'var(--color-ink)',
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
};
