/**
 * Closet tab — the premium 2.5D gallery of everything the user owns.
 *
 * Fetches the user's items (re-fetching on focus, so a piece added, edited, or
 * archived elsewhere is reflected on return). An empty closet shows the warm
 * empty state with both add affordances; a stocked one shows a category-grouped,
 * 2-column gallery of tilt-on-drag cutout tiles beneath a header (title, privacy
 * toggle, search, filter chips). Tapping a tile opens the detail sheet, where a
 * piece can be edited or archived. Colour, layout, motion, and copy come from
 * tokens and strings only.
 */
import { strings } from '@era/core/strings';
import { layout, spacing } from '@era/tokens';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, SectionList, StyleSheet, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/Button';
import { PageHeader } from '@/components/PageHeader';
import { ScreenEntrance } from '@/components/ScreenEntrance';
import { StaggerItem } from '@/components/StaggerItem';
import { Text } from '@/components/Text';
import { useTabBarVisibility } from '@/components/TabBarVisibility';
import { ClosetHeader, CutoutTile, ItemDetailSheet, SettingsGear, Toast } from '@/components/closet';
import { fetchItems, type ItemWithDisplay } from '@/components/items';
import { CATEGORIES, type ItemCategory } from '@/components/items/constants';
import { useDebouncedValue } from '@/lib/use-debounced-value';
import { useTheme } from '@/lib/theme';

type LoadState = 'loading' | 'ready' | 'error';

// The section list, reanimated-wrapped so its scroll can drive the tab bar's
// hide-on-scroll via a UI-thread `useAnimatedScrollHandler` (no per-frame JS).
const AnimatedSectionList = Animated.createAnimatedComponent(SectionList<ItemWithDisplay[]>);

// Route files require a default export — expo-router discovers screens this way.
export default function ClosetScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const visibility = useTabBarVisibility();

  const [items, setItems] = useState<readonly ItemWithDisplay[]>([]);
  const [state, setState] = useState<LoadState>('loading');
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<ItemCategory | null>(null);
  const [selected, setSelected] = useState<ItemWithDisplay | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const query = useDebouncedValue(search.trim().toLowerCase(), 200);

  const load = useCallback(async () => {
    try {
      const next = await fetchItems();
      setItems(next);
      // Keep the open detail sheet in sync after an edit (fresh tags/name).
      setSelected((current) => (current ? (next.find((i) => i.id === current.id) ?? current) : current));
      setState('ready');
    } catch {
      setState('error');
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const goAdd = useCallback(() => router.push('/add-item'), [router]);

  const openDetail = useCallback((item: ItemWithDisplay) => {
    setSelected(item);
    setSheetOpen(true);
  }, []);

  const onArchived = useCallback((id: string) => {
    setItems((prev) => prev.filter((item) => item.id !== id));
    setToast(strings.closet.archived);
  }, []);

  const onUpdated = useCallback((next: ItemWithDisplay) => {
    setItems((prev) => prev.map((item) => (item.id === next.id ? next : item)));
    setSelected(next);
    setToast(strings.closet.itemSaved);
  }, []);

  // Categories the closet actually holds, in enum order — drives the filter chips.
  const categories = useMemo(
    () => CATEGORIES.filter((cat) => items.some((item) => item.category === cat)),
    [items],
  );

  // Visible items after the search + category filter.
  const visible = useMemo(
    () =>
      items.filter(
        (item) =>
          (category === null || item.category === category) && matchesQuery(item, query),
      ),
    [items, category, query],
  );

  // Group the visible items by category (enum order), each chunked into rows of 2.
  const sections = useMemo(() => {
    const byCategory = new Map<ItemCategory, ItemWithDisplay[]>();
    for (const item of visible) {
      const list = byCategory.get(item.category);
      if (list) list.push(item);
      else byCategory.set(item.category, [item]);
    }
    return CATEGORIES.flatMap((cat) => {
      const list = byCategory.get(cat);
      if (!list || list.length === 0) return [];
      return [{ title: strings.closet.categoryLabel(cat), data: chunk(list, 2) }];
    });
  }, [visible]);

  const toastBottom = layout.tabBarHeight + insets.bottom + spacing.s3;

  if (state === 'loading') {
    return (
      <SafeAreaView style={[styles.screen, { backgroundColor: colors.bg }]} edges={['top']}>
        <View style={styles.centered}>
          <ActivityIndicator color={colors.text} />
        </View>
      </SafeAreaView>
    );
  }

  if (state === 'error') {
    return (
      <SafeAreaView style={[styles.screen, { backgroundColor: colors.bg }]} edges={['top']}>
        <View style={styles.centered}>
          <Text variant="body" color={colors.secondaryStrong} style={styles.centerCopy}>
            {strings.errors.generic}
          </Text>
          <Button label={strings.errors.retry} variant="secondary" onPress={load} />
        </View>
      </SafeAreaView>
    );
  }

  if (items.length === 0) {
    return (
      <SafeAreaView style={[styles.screen, { backgroundColor: colors.bg }]} edges={['top']}>
        {/* Settings stays reachable at zero items — a new user needs theme,
            privacy, legal, sign-out, and delete before their first piece. */}
        <View style={styles.emptyHeader}>
          <SettingsGear onPress={() => router.push('/settings')} />
        </View>
        <View style={styles.empty}>
          <Text
            accessibilityRole="header"
            variant="largeTitle"
            color={colors.text}
            style={{ textAlign: 'center' }}
          >
            {strings.closet.emptyTitle}
          </Text>
          <Text variant="body" color={colors.secondaryStrong} style={styles.centerCopy}>
            {strings.closet.emptyBody}
          </Text>
          <View style={styles.emptyActions}>
            <Button label={strings.closet.addCta} onPress={goAdd} haptic />
            <Button label={strings.closet.addFromLink} variant="secondary" onPress={goAdd} />
          </View>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <ScreenEntrance>
      <SafeAreaView style={[styles.screen, { backgroundColor: colors.bg }]} edges={['top']}>
        <AnimatedSectionList
          sections={sections}
          onScroll={visibility?.scrollHandler}
          scrollEventThrottle={16}
          keyExtractor={(row, index) => `${row[0]?.id ?? 'row'}-${index}`}
          renderItem={({ item: row, index }) => (
            <StaggerItem index={index}>
              <View style={styles.row}>
                {row.map((tile) => (
                  <View key={tile.id} style={styles.cell}>
                    <CutoutTile item={tile} onPress={openDetail} />
                  </View>
                ))}
                {row.length === 1 ? <View style={styles.cell} /> : null}
              </View>
            </StaggerItem>
          )}
          renderSectionHeader={({ section }) => (
            <Text
              variant="title"
              size="title3"
              color={colors.text}
              style={[styles.sectionHeader, { backgroundColor: colors.bg }]}
            >
              {section.title}
            </Text>
          )}
          ListHeaderComponent={
            <>
              <PageHeader title="Closet" subtitle={strings.closet.subtitle} />
              <ClosetHeader
                search={search}
                onSearch={setSearch}
                categories={categories}
                selected={category}
                onSelect={setCategory}
                onOpenSettings={() => router.push('/settings')}
                onOpenWorn={() => router.push('/worn')}
              />
            </>
          }
          stickySectionHeadersEnabled={false}
          contentContainerStyle={[
            styles.list,
            { paddingBottom: toastBottom + layout.touchTarget.ios },
          ]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        />

        <ItemDetailSheet
          item={selected}
          open={sheetOpen}
          onClose={() => setSheetOpen(false)}
          onUpdated={onUpdated}
          onArchived={onArchived}
          onToast={setToast}
        />

        <Toast message={toast} onHide={() => setToast(null)} bottom={toastBottom} />
      </SafeAreaView>
    </ScreenEntrance>
  );
}

/** True when the query is empty or matches the item's name, brand, or category. */
function matchesQuery(item: ItemWithDisplay, query: string): boolean {
  if (query.length === 0) return true;
  const haystack = [item.name, item.brand ?? '', strings.closet.categoryLabel(item.category)]
    .join(' ')
    .toLowerCase();
  return haystack.includes(query);
}

/** Split a list into fixed-size rows (the last row may be short). */
function chunk<T>(list: readonly T[], size: number): T[][] {
  const rows: T[][] = [];
  for (let i = 0; i < list.length; i += size) {
    rows.push(list.slice(i, i + size));
  }
  return rows;
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
  emptyHeader: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingHorizontal: spacing.s6,
  },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.s6,
    paddingHorizontal: spacing.s6,
    // The gear row above already claims the top inset; pull the centred content
    // up by that row's height so it stays optically centred in the screen.
    marginTop: -layout.touchTarget.ios,
  },
  emptyActions: {
    alignSelf: 'stretch',
    gap: spacing.s3,
  },
  list: {
    paddingHorizontal: layout.grid.mobileMargin,
    paddingTop: spacing.s8,
  },
  row: {
    flexDirection: 'row',
    gap: layout.grid.gutter,
    marginBottom: layout.grid.gutter,
  },
  cell: {
    flex: 1,
  },
  sectionHeader: {
    paddingTop: spacing.s4,
    paddingBottom: spacing.s3,
  },
  centerCopy: {
    textAlign: 'center',
  },
});
