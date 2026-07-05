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
  logRecEvent,
  rankProducts,
  searchProducts,
  ShopCard,
  ShopFilters,
  toSearchQuery,
  type ShopFilterState,
} from '@/components/shop';
import { useTheme } from '@/lib/theme';

type LoadState = 'loading' | 'ready' | 'error';

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
  const onView = useCallback((product: RankedProduct) => {
    if (!isHttpsUrl(product.affiliateUrl)) return;
    void Haptics.selectionAsync();
    logRecEvent({
      kind: 'rec_click',
      productId: product.id,
      retailer: product.retailer,
      why: product.why,
    });
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

  const visible = useMemo(
    () => products.filter((product) => !dismissed.has(product.id)),
    [products, dismissed],
  );

  const listPadBottom = layout.tabBarHeight + insets.bottom + spacing.s8;

  if (state === 'loading') {
    return (
      <SafeAreaView style={[styles.screen, { backgroundColor: colors.bg }]} edges={['top']}>
        <View style={styles.centered}>
          <ActivityIndicator color={colors.text} />
          <Text style={centerCopy(colors.secondaryStrong)}>{strings.shop.loading}</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (state === 'error') {
    return (
      <SafeAreaView style={[styles.screen, { backgroundColor: colors.bg }]} edges={['top']}>
        <View style={styles.centered}>
          <Text style={centerCopy(colors.secondaryStrong)}>{strings.shop.error}</Text>
          <Button label={strings.errors.retry} variant="secondary" onPress={loadReset} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: colors.bg }]} edges={['top']}>
      <FlatList
        data={visible}
        keyExtractor={(product) => product.id}
        renderItem={({ item }) => (
          <ShopCard product={item} onView={onView} onDismiss={onDismiss} />
        )}
        ListHeaderComponent={
          <ShopHeader
            active={hasActiveFilters(filters)}
            onOpenFilters={() => setFiltersOpen(true)}
          />
        }
        ListEmptyComponent={
          <Text style={[centerCopy(colors.secondaryStrong), styles.empty]}>
            {strings.shop.empty}
          </Text>
        }
        ListFooterComponent={
          loadingMore ? <ActivityIndicator color={colors.text} style={styles.footer} /> : null
        }
        onEndReached={loadMore}
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
    </SafeAreaView>
  );
}

/**
 * The list header — the trust frame plus the refine control. Renders the intro
 * and the affiliate disclosure BEFORE anything shoppable, then a pill that opens
 * the filter sheet (labelled with the sort/relevance line; an accent ring marks
 * active filters). The disclosure uses the `secondary` hue at body size (17pt),
 * the one place that legal/disclosure tone is contrast-cleared for.
 */
function ShopHeader({
  active,
  onOpenFilters,
}: {
  active: boolean;
  onOpenFilters: () => void;
}) {
  const { colors } = useTheme();
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
        {strings.shop.intro}
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

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={strings.shop.sortRelevance}
        accessibilityState={{ selected: active }}
        hitSlop={spacing.s2}
        onPress={onOpenFilters}
        style={[
          styles.refine,
          {
            backgroundColor: active ? `${colors.accent}29` : colors.surface,
            borderColor: active ? colors.accent : colors.hairline,
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
          {`${strings.shop.sortRelevance}  ▾`}
        </Text>
      </Pressable>
    </View>
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
  refine: {
    alignSelf: 'flex-start',
    marginTop: spacing.s1,
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
