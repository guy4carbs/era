/**
 * Shop tab — gap-driven picks, never a feed to scroll.
 *
 * Mirrors the web Shop: a full-screen list of quiet-luxury product cards, ranked
 * by how well each fills a real gap or completes looks from pieces already owned.
 * The flow per page is shop-search → rank-products → render sorted by fit, with
 * more pages loaded on scroll-end. A refine sheet narrows by brand tier, category,
 * budget band, and size; changing any dimension re-queries from page one.
 *
 * Trust is the frame: the intro and the affiliate disclosure render at the top,
 * before anything shoppable; every card that fills a gap or completes outfits says
 * so, and a near-duplicate of something owned is shown as an honest `similar_owned`
 * WARNING (caution styling), never sold over. Tapping a pick (or "View at …")
 * opens the affiliate link in the system browser with a selection haptic and logs
 * a fire-and-forget rec_click; "Not for me" removes the card and logs a rec_dismiss.
 *
 * Ranking is a bonus, not a gate: `rankProducts` never hard-fails, so a dormant
 * ranker still yields a browsable grid (unranked, no labels).
 */
import type { OviSuggestion as OviSuggestionData } from '@era/core/ovi';
import type { RankedProduct, WardrobeGap } from '@era/core/shop';
import { strings } from '@era/core/strings';
import { layout, radii, spacing } from '@era/tokens';
import * as Haptics from 'expo-haptics';
import * as Linking from 'expo-linking';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/Button';
import { FailedLoad } from '@/components/FailedLoad';
import { OviLoader } from '@/components/OviLoader';
import { Skeleton } from '@/components/Skeleton';
import { PageHeader } from '@/components/PageHeader';
import { Press } from '@/components/Press';
import { ScreenEntrance } from '@/components/ScreenEntrance';
import { StaggerItem } from '@/components/StaggerItem';
import { Text } from '@/components/Text';
import { useTabBarVisibility } from '@/components/TabBarVisibility';
import {
  EMPTY_FILTERS,
  filtersFromQuery,
  GapsHero,
  getWardrobeGaps,
  hasActiveFilters,
  listSaved,
  logRecEvent,
  rankProducts,
  saveProduct,
  searchProducts,
  ShopCard,
  ShopFilters,
  toSearchQuery,
  unsaveProduct,
  WhyDetailSheet,
  type SavedShopProduct,
  type ShopCardProduct,
  type ShopFilterState,
} from '@/components/shop';
import { CartSheet, addToCart, getCart, checkoutCopy } from '@/components/checkout';
import { OviSuggestion, useOviState } from '@/components/ovi';
import { cardCheckoutSupport, eraCheckoutEnabled } from '@/lib/checkout-flag';
import { useTheme } from '@/lib/theme';

type LoadState = 'loading' | 'ready' | 'error';

/** Which list the tab is showing: the ranked feed, or the saved wishlist. */
type ShopView = 'forYou' | 'saved';

// Load the next page a little before the very end so the grid feels continuous.
const END_REACHED_THRESHOLD = 0.6;

// The product list, reanimated-wrapped so its scroll drives the tab bar's
// hide-on-scroll via a UI-thread `useAnimatedScrollHandler` (no per-frame JS).
const AnimatedFlatList = Animated.createAnimatedComponent(FlatList<ShopCardProduct>);

// Route files require a default export — expo-router discovers screens this way.
export default function ShopScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const visibility = useTabBarVisibility();
  const { openOvi } = useOviState();

  const [filters, setFilters] = useState<ShopFilterState>(EMPTY_FILTERS);
  const [products, setProducts] = useState<readonly RankedProduct[]>([]);
  const [dismissed, setDismissed] = useState<ReadonlySet<string>>(() => new Set());
  const [state, setState] = useState<LoadState>('loading');
  const [loadingMore, setLoadingMore] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);

  // The Saved wishlist runs parallel to the ranked feed. `savedIds` is the O(1)
  // lookup that drives each ranked card's filled heart; `savedProducts` is the
  // list the Saved view renders. Both are updated together (optimistically) and
  // hydrated once on mount. `savedLoaded` distinguishes "still fetching" from a
  // genuinely empty wishlist so the Saved view shows a spinner, not "nothing yet".
  const [view, setView] = useState<ShopView>('forYou');
  const [savedIds, setSavedIds] = useState<ReadonlySet<string>>(() => new Set());
  const [savedProducts, setSavedProducts] = useState<readonly SavedShopProduct[]>([]);
  const [savedLoaded, setSavedLoaded] = useState(false);

  // The pick whose why-detail sheet is open (null = closed). Lifted here because a
  // per-card GlassSheet would fill only its cell, not the screen.
  const [whyProduct, setWhyProduct] = useState<RankedProduct | null>(null);

  // In-flow cart state (only ever exercised when the cosmetic checkout flag is on):
  // the badge count on the Shop header and whether the cart sheet is open. The count
  // is seeded from the server on mount and reconciled after every add so an
  // idempotent re-add (server no-op) never drifts the badge.
  const [cartCount, setCartCount] = useState(0);
  const [cartOpen, setCartOpen] = useState(false);

  const reconcileCartCount = useCallback(() => {
    void getCart()
      .then((items) => setCartCount(items.reduce((sum, item) => sum + Math.max(0, item.quantity), 0)))
      .catch(() => {
        // A count read miss is invisible — the badge just keeps its last value.
      });
  }, []);

  // Seed the badge from the live cart once, when checkout is on.
  useEffect(() => {
    if (!eraCheckoutEnabled) return;
    reconcileCartCount();
  }, [reconcileCartCount]);

  // Add a pick to the cross-store cart: bump the badge optimistically, then reconcile
  // from the server (the add is idempotent, so the reconcile is the source of truth).
  const onAddToCart = useCallback(
    (product: ShopCardProduct) => {
      setCartCount((count) => count + 1);
      void addToCart(product).then(reconcileCartCount, reconcileCartCount);
    },
    [reconcileCartCount],
  );

  // The genuine wardrobe gaps shown atop the ranked feed. Hydrated once,
  // independently and non-blocking: `getWardrobeGaps` degrades to [] on any error,
  // so a gaps miss never breaks browse — the hero just collapses to its empty line.
  const [gaps, setGaps] = useState<readonly WardrobeGap[]>([]);

  // Hydrate the wishlist once. `listSaved` degrades to [] on error, so this always
  // resolves — the Saved view opens empty rather than erroring.
  useEffect(() => {
    let active = true;
    void listSaved().then((products) => {
      if (!active) return;
      setSavedProducts(products);
      setSavedIds(new Set(products.map((product) => product.id)));
      setSavedLoaded(true);
    });
    return () => {
      active = false;
    };
  }, []);

  // Hydrate the wardrobe gaps once, non-blocking. `getWardrobeGaps` degrades to []
  // on error, so this always resolves — a gaps failure never blocks the feed.
  useEffect(() => {
    let active = true;
    void getWardrobeGaps().then((next) => {
      if (active) setGaps(next);
    });
    return () => {
      active = false;
    };
  }, []);

  // "Fill this gap": apply the gap's pre-filtered query to the Shop filter state
  // (via the same filter→query path a manual refine uses) and return to the ranked
  // feed. Changing `filters` re-runs `loadReset`, landing in a pre-filtered view.
  const onFillGap = useCallback((gap: WardrobeGap) => {
    void Haptics.selectionAsync();
    setFilters(filtersFromQuery(gap.suggestedQuery));
    setView('forYou');
  }, []);

  // Every axis is now a tap-only chip, so each selection re-queries immediately —
  // no debounce (that only mattered for the old free-entry size box).
  const { brandTier, category, budgetId, size } = filters;

  // A monotonic request id: a reset bumps it, so a slow page-append that resolves
  // after a re-query is discarded instead of appending stale results.
  const reqId = useRef(0);

  // Reset to page one for the current filters. Re-runs whenever a chip changes or
  // the debounced size settles.
  const loadReset = useCallback(async () => {
    const id = ++reqId.current;
    setState('loading');
    try {
      const result = await searchProducts(toSearchQuery({ brandTier, category, budgetId, size }, 1));
      const ranked = await rankProducts(result.products);
      if (id !== reqId.current) return;
      setProducts(ranked);
      setPage(result.page);
      setHasMore(result.hasMore);
      setState('ready');
    } catch {
      if (id !== reqId.current) return;
      setState('error');
    }
  }, [brandTier, category, budgetId, size]);

  useEffect(() => {
    void loadReset();
  }, [loadReset]);

  // Append the next page on scroll-end. A failed append is non-fatal — the grid
  // keeps what it has. Guarded so a concurrent reset supersedes it.
  const loadMore = useCallback(async () => {
    if (state !== 'ready' || loadingMore || !hasMore) return;
    const id = reqId.current;
    setLoadingMore(true);
    try {
      const result = await searchProducts(
        toSearchQuery({ brandTier, category, budgetId, size }, page + 1),
      );
      const ranked = await rankProducts(result.products);
      if (id !== reqId.current) return;
      setProducts((prev) => [...prev, ...ranked]);
      setPage(result.page);
      setHasMore(result.hasMore);
    } catch {
      // Keep the pages we have; the next scroll-end can retry.
    } finally {
      setLoadingMore(false);
    }
  }, [state, loadingMore, hasMore, page, brandTier, category, budgetId, size]);

  // Tapping a pick opens the affiliate link in the system browser (+ selection
  // haptic) and logs a fire-and-forget rec_click. The URL is guarded to https:
  // before opening (defense-in-depth beside Forge's server-side drop) — a hostile
  // feed could otherwise return a tel:/sms:/custom-scheme link to open natively.
  const onView = useCallback((product: ShopCardProduct) => {
    if (!isHttpsUrl(product.affiliateUrl)) return;
    void Haptics.selectionAsync();
    // Only ranked picks carry a `why` to log — a saved click-out just opens the
    // link. `'why' in product` narrows the union to the ranked shape.
    if ('why' in product) {
      logRecEvent({
        kind: 'rec_click',
        productId: product.id,
        retailer: product.retailer,
        why: product.why,
      });
    }
    void Linking.openURL(product.affiliateUrl).catch(() => {
      // A device with no browser handler is vanishingly rare; nothing to recover.
    });
  }, []);

  // "Not for me" removes the card and logs a rec_dismiss — no guilt, no reload.
  const onDismiss = useCallback((product: RankedProduct) => {
    setDismissed((prev) => {
      const next = new Set(prev);
      next.add(product.id);
      return next;
    });
    logRecEvent({
      kind: 'rec_dismiss',
      productId: product.id,
      retailer: product.retailer,
      why: product.why,
    });
  }, []);

  // Toggle a ranked pick's wishlist state. Optimistic: the heart + Saved list flip
  // instantly, then the write runs; a failure reverts both to where they were. Only
  // ranked cards reach this — saving needs the full ShopProduct the feed carries.
  const toggleSaveRanked = useCallback(
    (product: RankedProduct) => {
      const id = product.id;
      const wasSaved = savedIds.has(id);
      setSavedIds((prev) => withMembership(prev, id, !wasSaved));
      setSavedProducts((prev) =>
        wasSaved ? prev.filter((p) => p.id !== id) : [toSaved(product), ...prev],
      );
      const write = wasSaved ? unsaveProduct(id) : saveProduct(product);
      void write.catch(() => {
        setSavedIds((prev) => withMembership(prev, id, wasSaved));
        setSavedProducts((prev) =>
          wasSaved ? [toSaved(product), ...prev] : prev.filter((p) => p.id !== id),
        );
      });
    },
    [savedIds],
  );

  // Remove a pick from the Saved view. The heart there is always filled, so a tap
  // only ever un-saves. Optimistic with the same revert-on-error contract.
  const unsaveSaved = useCallback((product: SavedShopProduct) => {
    const id = product.id;
    setSavedIds((prev) => withMembership(prev, id, false));
    setSavedProducts((prev) => prev.filter((p) => p.id !== id));
    void unsaveProduct(id).catch(() => {
      setSavedIds((prev) => withMembership(prev, id, true));
      setSavedProducts((prev) => [product, ...prev]);
    });
  }, []);

  const openWhy = useCallback((product: RankedProduct) => setWhyProduct(product), []);

  const visible = useMemo(
    () => products.filter((product) => !dismissed.has(product.id)),
    [products, dismissed],
  );

  // Ovi's ambient Shop whisper — the completes-looks 'why', lifted from the
  // per-card treatment into Ovi's strip grammar (one voice, not doubled up). It
  // speaks the STRONGEST completes-outfits count in the ranked feed
  // (`shopCompletes(count)`) and, tapped, opens Ovi on her gap ask so she can walk
  // the real gap. Null when nothing in view completes a look — then no strip, and
  // the per-card whys still carry the finer detail. Only ever on the ranked view.
  const shopSuggestion = useMemo<OviSuggestionData | null>(() => {
    if (view === 'saved') return null;
    let best = 0;
    for (const product of visible) {
      if (product.why?.kind === 'completes_outfits' && product.why.count > best) {
        best = product.why.count;
      }
    }
    if (best === 0) return null;
    return {
      // Key on the count so a stronger completion may speak again after dismissal,
      // but the same count stays retired.
      key: `shop:completes:${best}`,
      line: strings.ovi.suggest.shopCompletes(best),
      action: strings.ovi.suggest.actionShowMe,
      intent: 'whats_missing',
      itemId: null,
    };
  }, [view, visible]);

  const listPadBottom = layout.tabBarHeight + insets.bottom + spacing.s8;

  // The ranked feed's loading/error frames only gate the "For you" view — the
  // Saved wishlist is hydrated independently and stays reachable regardless.
  if (view === 'forYou' && state === 'loading') {
    // Skeleton product cards where the ranked feed will land — full-width
    // shimmering rows on the list's own margin, never a bare spinner.
    return (
      <SafeAreaView style={[styles.screen, { backgroundColor: colors.bg }]} edges={['top']}>
        <ShopSkeletonList />
      </SafeAreaView>
    );
  }

  if (view === 'forYou' && state === 'error') {
    return (
      <SafeAreaView style={[styles.screen, { backgroundColor: colors.bg }]} edges={['top']}>
        <View style={styles.centered}>
          {/* The editorial failed-load frame with the shop's own voice line, plus
              the saved-wishlist tap-out below it (Saved hydrates independently). */}
          <FailedLoad line={strings.shop.error} onRetry={loadReset} />
          <Button
            label={strings.shop.saved.tab}
            variant="ghost"
            onPress={() => setView('saved')}
          />
        </View>
      </SafeAreaView>
    );
  }

  const saved = view === 'saved';
  const data: readonly ShopCardProduct[] = saved ? savedProducts : visible;

  return (
    <ScreenEntrance>
      <SafeAreaView style={[styles.screen, { backgroundColor: colors.bg }]} edges={['top']}>
      <AnimatedFlatList
        data={data}
        onScroll={visibility?.scrollHandler}
        scrollEventThrottle={16}
        keyExtractor={(product) => product.id}
        renderItem={({ item, index }) => (
          <StaggerItem index={index}>
            {/* Ranked picks (with `whyDetail`) get the dismiss + why affordances; saved
                picks get a permanently-filled heart that un-saves on tap. */}
            {'whyDetail' in item ? (
              <ShopCard
                product={item}
                onView={onView}
                isSaved={savedIds.has(item.id)}
                onToggleSave={() => toggleSaveRanked(item)}
                onDismiss={onDismiss}
                onOpenWhy={openWhy}
                canAddToCart={cardCheckoutSupport(item) === 'in_flow'}
                onAddToCart={onAddToCart}
              />
            ) : (
              <ShopCard
                product={item}
                onView={onView}
                isSaved
                onToggleSave={() => unsaveSaved(item)}
                canAddToCart={cardCheckoutSupport(item) === 'in_flow'}
                onAddToCart={onAddToCart}
              />
            )}
          </StaggerItem>
        )}
        ListHeaderComponent={
          <>
            <ShopHeader
              view={view}
              onSelectView={setView}
              active={hasActiveFilters(filters)}
              onOpenFilters={() => setFiltersOpen(true)}
              cartCount={cartCount}
              onOpenCart={() => setCartOpen(true)}
            />
            {/* The gaps band leads the ranked feed only — it's guidance toward the
                picks below, not part of the Saved wishlist. */}
            {saved ? null : <GapsHero gaps={gaps} onFill={onFillGap} />}
            {/* Ovi's ambient completes-looks whisper — the 'why' treatment in her
                strip grammar, above the picks in normal flow (ranked view only).
                Null → no strip; the per-card whys still carry the finer detail. */}
            {saved ? null : (
              <View style={styles.suggestion}>
                <OviSuggestion
                  suggestion={shopSuggestion}
                  onOpen={(s) => openOvi({ intent: s.intent, itemId: s.itemId })}
                />
              </View>
            )}
          </>
        }
        ListEmptyComponent={
          saved ? (
            savedLoaded ? (
              <Text
                variant="body"
                color={colors.secondaryStrong}
                style={[styles.centerCopy, styles.empty]}
              >
                {strings.shop.saved.empty}
              </Text>
            ) : (
              <OviLoader variant="inline" style={styles.footer} />
            )
          ) : (
            <Text
              variant="body"
              color={colors.secondaryStrong}
              style={[styles.centerCopy, styles.empty]}
            >
              {strings.shop.empty}
            </Text>
          )
        }
        ListFooterComponent={
          !saved && loadingMore ? (
            <OviLoader variant="inline" style={styles.footer} />
          ) : null
        }
        onEndReached={saved ? undefined : loadMore}
        onEndReachedThreshold={END_REACHED_THRESHOLD}
        contentContainerStyle={[styles.list, { paddingBottom: listPadBottom }]}
        ItemSeparatorComponent={ItemSeparator}
        showsVerticalScrollIndicator={false}
      />

      <ShopFilters
        open={filtersOpen}
        onClose={() => setFiltersOpen(false)}
        filters={filters}
        onChange={setFilters}
      />

      <WhyDetailSheet product={whyProduct} onClose={() => setWhyProduct(null)} />

      {/* In-flow cart — only mounted when the cosmetic checkout flag is on. The
          server re-gates every call, so an off build never reaches these routes. */}
      {eraCheckoutEnabled ? (
        <CartSheet
          open={cartOpen}
          onClose={() => setCartOpen(false)}
          onCartCountChange={setCartCount}
        />
      ) : null}
      </SafeAreaView>
    </ScreenEntrance>
  );
}

/**
 * The list header — the trust frame plus the view controls. Renders the intro (the
 * ranked promise, or the Saved reassurance) and the affiliate disclosure BEFORE
 * anything shoppable, then a controls row: the refine pill (ranked view only,
 * labelled with the sort/relevance line, an accent ring marking active filters)
 * and a Saved toggle that flips between the ranked feed and the wishlist. The
 * disclosure uses the `secondary` hue at body size (17pt), the one place that
 * legal/disclosure tone is contrast-cleared for — and it stays visible in the
 * Saved view too, since those cards also click out to affiliate links.
 */
function ShopHeader({
  view,
  onSelectView,
  active,
  onOpenFilters,
  cartCount,
  onOpenCart,
}: {
  view: ShopView;
  onSelectView: (view: ShopView) => void;
  active: boolean;
  onOpenFilters: () => void;
  cartCount: number;
  onOpenCart: () => void;
}) {
  const { colors } = useTheme();
  const saved = view === 'saved';
  return (
    <View style={styles.header}>
      {/* Title + intro carry the D6 header choreography. The intro is the subtitle
          (it swaps with the Saved view). The 32px header-below rhythm is trimmed to
          the tight header gap here so the disclosure stays grouped with the intro. */}
      <PageHeader
        title={strings.shop.title}
        subtitle={saved ? strings.shop.saved.intro : strings.shop.intro}
        style={styles.pageHeader}
      />

      {/* FTC-honest affiliate disclosure — visible above the picks, per Shield/Ledger.
          Unchanged: `secondary` hue at body size (17pt), the one disclosure exception. */}
      <Text variant="body" color={colors.secondary}>
        {strings.shop.affiliateDisclosure}
      </Text>

      <View style={styles.controls}>
        {/* Refine only narrows the ranked feed; hidden in the Saved view. */}
        {saved ? null : (
          <HeaderPill
            label={`${strings.shop.sortRelevance}  ▾`}
            accessibilityLabel={strings.shop.sortRelevance}
            selected={active}
            onPress={onOpenFilters}
          />
        )}

        <HeaderPill
          label={strings.shop.saved.tab}
          accessibilityLabel={strings.shop.saved.tab}
          selected={saved}
          onPress={() => onSelectView(saved ? 'forYou' : 'saved')}
        />

        {/* Cart entry + quiet count badge — only when in-flow checkout is on. */}
        {eraCheckoutEnabled ? (
          <HeaderPill
            label={cartCount > 0 ? `${strings.shop.checkout.cartTitle} · ${cartCount}` : strings.shop.checkout.cartTitle}
            accessibilityLabel={checkoutCopy.cartCount(cartCount)}
            selected={cartCount > 0}
            onPress={onOpenCart}
          />
        ) : null}
      </View>
    </View>
  );
}

/**
 * A quiet-luxury header pill — a bordered chip whose accent ring/tint marks the
 * selected state (active filters, or the Saved view). Shared by the refine control
 * and the Saved toggle so they read as one control row.
 */
function HeaderPill({
  label,
  accessibilityLabel,
  selected,
  onPress,
}: {
  label: string;
  accessibilityLabel: string;
  selected: boolean;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  return (
    <Press
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ selected }}
      hitSlop={spacing.s2}
      onPress={onPress}
      style={[
        styles.refine,
        {
          backgroundColor: selected ? `${colors.accent}29` : colors.surface,
          borderColor: selected ? colors.accent : colors.hairline,
          borderRadius: radii.chip,
        },
      ]}
    >
      <Text variant="ui" size="footnote" weight={600} color={colors.text}>
        {label}
      </Text>
    </Press>
  );
}

/** A gutter between cards, matching the closet grid's rhythm. */
function ItemSeparator() {
  return <View style={{ height: layout.grid.gutter }} />;
}

/**
 * The shop's loading state: full-width `row` skeletons stacked where the ranked
 * ShopCards will land, on the list's margin and gutter rhythm. Reduced motion
 * renders them static (Skeleton handles that).
 */
const SHOP_SKELETON_CARDS = 4;
function ShopSkeletonList() {
  return (
    <View style={styles.skeletonList}>
      {Array.from({ length: SHOP_SKELETON_CARDS }, (_, i) => (
        <Skeleton key={i} variant="row" />
      ))}
    </View>
  );
}

/**
 * True only for a well-formed `https:` URL. Guards the native open against a
 * hostile feed handing back a `tel:`/`sms:`/custom-scheme link — anything that
 * doesn't parse as https is refused before it can reach `Linking.openURL`.
 */
function isHttpsUrl(value: string): boolean {
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
}

/** Return a copy of `set` with `id` present (`member`) or absent. */
function withMembership(set: ReadonlySet<string>, id: string, member: boolean): ReadonlySet<string> {
  const next = new Set(set);
  if (member) next.add(id);
  else next.delete(id);
  return next;
}

/** Project a ranked pick to the leaner shape the Saved list stores/renders. */
function toSaved(product: RankedProduct): SavedShopProduct {
  return {
    id: product.id,
    title: product.title,
    brand: product.brand,
    category: product.category,
    price: product.price,
    currency: product.currency,
    imageUrl: product.imageUrl,
    retailer: product.retailer,
    productUrl: product.productUrl,
    affiliateUrl: product.affiliateUrl,
  };
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.s4,
    paddingHorizontal: spacing.s6,
  },
  list: {
    paddingHorizontal: layout.grid.mobileMargin,
    paddingTop: spacing.s6,
  },
  // Loading skeletons sit on the same margin/rhythm as the real product list.
  skeletonList: {
    paddingHorizontal: layout.grid.mobileMargin,
    paddingTop: spacing.s6,
    gap: layout.grid.gutter,
  },
  header: {
    gap: spacing.s3,
    paddingBottom: spacing.s6,
  },
  // The PageHeader's built-in 32px header-below rhythm is dropped here so the
  // affiliate disclosure and controls stay tight under the intro (the header
  // block's own `gap` spaces them); the header's paddingBottom leads to the picks.
  pageHeader: {
    marginBottom: 0,
  },
  controls: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: spacing.s2,
    marginTop: spacing.s1,
  },
  refine: {
    alignSelf: 'flex-start',
    paddingVertical: spacing.s2,
    paddingHorizontal: spacing.s3,
    borderWidth: StyleSheet.hairlineWidth,
    borderCurve: 'continuous',
  },
  centerCopy: {
    textAlign: 'center',
  },
  empty: {
    paddingVertical: spacing.s8,
  },
  footer: {
    paddingVertical: spacing.s6,
    alignItems: 'center',
  },
  // The ambient strip sits below the gaps band, above the first pick.
  suggestion: {
    paddingBottom: spacing.s4,
  },
});
