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
import type { RankedProduct } from '@era/core/shop';
import { strings } from '@era/core/strings';
import { layout, radii, spacing, typeRamp } from '@era/tokens';
import * as Haptics from 'expo-haptics';
import * as Linking from 'expo-linking';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/Button';
import {
  EMPTY_FILTERS,
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
import { useTheme } from '@/lib/theme';

type LoadState = 'loading' | 'ready' | 'error';

/** Which list the tab is showing: the ranked feed, or the saved wishlist. */
type ShopView = 'forYou' | 'saved';

// Load the next page a little before the very end so the grid feels continuous.
const END_REACHED_THRESHOLD = 0.6;

// Route files require a default export — expo-router discovers screens this way.
export default function ShopScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

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

  const listPadBottom = layout.tabBarHeight + insets.bottom + spacing.s8;

  // The ranked feed's loading/error frames only gate the "For you" view — the
  // Saved wishlist is hydrated independently and stays reachable regardless.
  if (view === 'forYou' && state === 'loading') {
    return (
      <SafeAreaView style={[styles.screen, { backgroundColor: colors.bg }]} edges={['top']}>
        <View style={styles.centered}>
          <ActivityIndicator color={colors.text} />
          <Text style={centerCopy(colors.secondaryStrong)}>{strings.shop.loading}</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (view === 'forYou' && state === 'error') {
    return (
      <SafeAreaView style={[styles.screen, { backgroundColor: colors.bg }]} edges={['top']}>
        <View style={styles.centered}>
          <Text style={centerCopy(colors.secondaryStrong)}>{strings.shop.error}</Text>
          <Button label={strings.errors.retry} variant="secondary" onPress={loadReset} />
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
    <SafeAreaView style={[styles.screen, { backgroundColor: colors.bg }]} edges={['top']}>
      <FlatList
        data={data}
        keyExtractor={(product) => product.id}
        renderItem={({ item }) =>
          // Ranked picks (with `whyDetail`) get the dismiss + why affordances; saved
          // picks get a permanently-filled heart that un-saves on tap.
          'whyDetail' in item ? (
            <ShopCard
              product={item}
              onView={onView}
              isSaved={savedIds.has(item.id)}
              onToggleSave={() => toggleSaveRanked(item)}
              onDismiss={onDismiss}
              onOpenWhy={openWhy}
            />
          ) : (
            <ShopCard
              product={item}
              onView={onView}
              isSaved
              onToggleSave={() => unsaveSaved(item)}
            />
          )
        }
        ListHeaderComponent={
          <ShopHeader
            view={view}
            onSelectView={setView}
            active={hasActiveFilters(filters)}
            onOpenFilters={() => setFiltersOpen(true)}
          />
        }
        ListEmptyComponent={
          saved ? (
            savedLoaded ? (
              <Text style={[centerCopy(colors.secondaryStrong), styles.empty]}>
                {strings.shop.saved.empty}
              </Text>
            ) : (
              <ActivityIndicator color={colors.text} style={styles.footer} />
            )
          ) : (
            <Text style={[centerCopy(colors.secondaryStrong), styles.empty]}>
              {strings.shop.empty}
            </Text>
          )
        }
        ListFooterComponent={
          !saved && loadingMore ? (
            <ActivityIndicator color={colors.text} style={styles.footer} />
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
    </SafeAreaView>
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
}: {
  view: ShopView;
  onSelectView: (view: ShopView) => void;
  active: boolean;
  onOpenFilters: () => void;
}) {
  const { colors } = useTheme();
  const saved = view === 'saved';
  return (
    <View style={styles.header}>
      <Text
        accessibilityRole="header"
        style={{
          color: colors.text,
          fontSize: typeRamp.largeTitle.pt,
          lineHeight: typeRamp.largeTitle.lineHeight,
          fontWeight: '700',
        }}
      >
        {strings.shop.title}
      </Text>

      <Text
        style={{
          color: colors.secondaryStrong,
          fontSize: typeRamp.body.pt,
          lineHeight: typeRamp.body.lineHeight,
        }}
      >
        {saved ? strings.shop.saved.intro : strings.shop.intro}
      </Text>

      {/* FTC-honest affiliate disclosure — visible above the picks, per Shield/Ledger. */}
      <Text
        style={{
          color: colors.secondary,
          fontSize: typeRamp.body.pt,
          lineHeight: typeRamp.body.lineHeight,
        }}
      >
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
    <Pressable
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
      <Text
        style={{
          color: colors.text,
          fontSize: typeRamp.footnote.pt,
          lineHeight: typeRamp.footnote.lineHeight,
          fontWeight: '600',
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

/** A gutter between cards, matching the closet grid's rhythm. */
function ItemSeparator() {
  return <View style={{ height: layout.grid.gutter }} />;
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

/** Centered secondary copy — shared by the loading / error / empty states. */
function centerCopy(color: string) {
  return {
    color,
    fontSize: typeRamp.body.pt,
    lineHeight: typeRamp.body.lineHeight,
    textAlign: 'center' as const,
  };
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
  header: {
    gap: spacing.s3,
    paddingBottom: spacing.s6,
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
  empty: {
    paddingVertical: spacing.s8,
  },
  footer: {
    paddingVertical: spacing.s6,
  },
});
