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
import { layout, spacing, typeRamp } from '@era/tokens';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, SectionList, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/Button';
import { ClosetHeader, CutoutTile, ItemDetailSheet, SettingsGear, Toast } from '@/components/closet';
import { fetchItems, type ItemWithDisplay } from '@/components/items';
import { CATEGORIES, type ItemCategory } from '@/components/items/constants';
import { useDebouncedValue } from '@/lib/use-debounced-value';
import { useTheme } from '@/lib/theme';

type LoadState = 'loading' | 'ready' | 'error';

// Route files require a default export — expo-router discovers screens this way.
export default function ClosetScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();

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
          <Text style={centerCopy(colors.secondaryStrong)}>{strings.errors.generic}</Text>
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
            style={{
              color: colors.text,
              fontSize: typeRamp.largeTitle.pt,
              lineHeight: typeRamp.largeTitle.lineHeight,
              fontWeight: '700',
              textAlign: 'center',
            }}
          >
            {strings.closet.emptyTitle}
          </Text>
          <Text style={centerCopy(colors.secondaryStrong)}>{strings.closet.emptyBody}</Text>
          <View style={styles.emptyActions}>
            <Button label={strings.closet.addCta} onPress={goAdd} haptic />
            <Button label={strings.closet.addFromLink} variant="secondary" onPress={goAdd} />
          </View>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: colors.bg }]} edges={['top']}>
      <SectionList
        sections={sections}
        keyExtractor={(row, index) => `${row[0]?.id ?? 'row'}-${index}`}
        renderItem={({ item: row }) => (
          <View style={styles.row}>
            {row.map((tile) => (
              <View key={tile.id} style={styles.cell}>
                <CutoutTile item={tile} onPress={openDetail} />
              </View>
            ))}
            {row.length === 1 ? <View style={styles.cell} /> : null}
          </View>
        )}
        renderSectionHeader={({ section }) => (
          <Text
            style={[
              styles.sectionHeader,
              {
                color: colors.text,
                backgroundColor: colors.bg,
                fontSize: typeRamp.title3.pt,
                lineHeight: typeRamp.title3.lineHeight,
              },
            ]}
          >
            {section.title}
          </Text>
        )}
        ListHeaderComponent={
          <ClosetHeader
            search={search}
            onSearch={setSearch}
            categories={categories}
            selected={category}
            onSelect={setCategory}
            onOpenSettings={() => router.push('/settings')}
          />
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
      />

      <Toast message={toast} onHide={() => setToast(null)} bottom={toastBottom} />
    </SafeAreaView>
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

/** Centered secondary copy — shared by the empty / error states. */
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
    fontWeight: '600',
    paddingTop: spacing.s4,
    paddingBottom: spacing.s3,
  },
});
