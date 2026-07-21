/**
 * Closet tab — the premium editorial gallery of everything the user owns.
 *
 * Fetches the user's items (re-fetching on focus, so a piece added, edited, or
 * archived elsewhere is reflected on return). An empty closet shows the signature
 * empty state — Ovi's glow orb + a single line + one primary add; a stocked one
 * shows a category-grouped gallery of tilt-on-drag cutout tiles beneath a header
 * (title + piece count, privacy toggle, search, filter chips, a density toggle).
 * The grid density (comfortable | compact) is persisted; the entrance cascade
 * fires once per app SESSION so a re-focus never replays it. Tapping a tile opens
 * the detail sheet, where a piece can be edited or archived. Colour, layout,
 * motion, and copy come from tokens and strings only.
 */
import { strings } from '@era/core/strings';
import { layout, spacing } from '@era/tokens';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, SectionList, StyleSheet, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/Button';
import { PageHeader } from '@/components/PageHeader';
import { ScreenEntrance } from '@/components/ScreenEntrance';
import { StaggerItem } from '@/components/StaggerItem';
import { Text } from '@/components/Text';
import { useTabBarVisibility } from '@/components/TabBarVisibility';
import {
  ClosetHeader,
  CutoutTile,
  ItemDetailSheet,
  SettingsGear,
  Toast,
  type ClosetDensity,
} from '@/components/closet';
import { fetchItems, TiltFieldProvider, type ItemWithDisplay } from '@/components/items';
import { CATEGORIES, type ItemCategory } from '@/components/items/constants';
import { OviOrb } from '@/components/ovi';
import { readClosetDensity, writeClosetDensity } from '@/lib/closet-density';
import { useDebouncedValue } from '@/lib/use-debounced-value';
import { useTheme } from '@/lib/theme';

type LoadState = 'loading' | 'ready' | 'error';

// Once-per-app-SESSION cascade guard. StaggerItem's rise+fade is delightful the
// first time the gallery appears, but replaying it on every tab focus/mount
// reads as jitter. This module-level flag flips true after the first stocked
// render, so subsequent visits render the rows plainly (no entrance wrapper).
// Reduced motion is unaffected — StaggerItem already collapses to a fade there.
let hasCascadedThisSession = false;

/** Columns + row gap per density. Compact packs 3-up on the tight gutter. */
const DENSITY_GRID = {
  comfortable: { columns: 2, rowGap: layout.grid.gutterTall },
  compact: { columns: 3, rowGap: layout.grid.gutter },
} as const;

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
  const [density, setDensity] = useState<ClosetDensity>('comfortable');
  const [selected, setSelected] = useState<ItemWithDisplay | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  // True only while this tab is focused — gates the device-tilt field's sensor
  // so the gyro stops the moment the user leaves the closet (tab screens stay
  // mounted, so unmount alone never would).
  const [focused, setFocused] = useState(false);

  const query = useDebouncedValue(search.trim().toLowerCase(), 200);

  // Hydrate the persisted density once on mount (read-on-mount, mirroring
  // lib/theme.tsx); the toggle writes on change.
  useEffect(() => {
    let active = true;
    void readClosetDensity().then((stored) => {
      if (active) setDensity(stored);
    });
    return () => {
      active = false;
    };
  }, []);

  const onDensity = useCallback((next: ClosetDensity) => {
    setDensity(next);
    writeClosetDensity(next);
  }, []);

  // Whether this render's rows should carry the entrance cascade: only the FIRST
  // stocked appearance in the app session does. Captured before the flip effect
  // runs so the very first render still animates, then held false thereafter.
  const [cascade] = useState(() => !hasCascadedThisSession);

  // Flip the session guard once the gallery has actually rendered stocked, so a
  // later focus/mount renders plainly (no replayed 45ms cascade).
  useEffect(() => {
    if (state === 'ready' && items.length > 0) {
      hasCascadedThisSession = true;
    }
  }, [state, items.length]);

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
      setFocused(true);
      return () => setFocused(false);
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

  const { columns, rowGap } = DENSITY_GRID[density];

  // Group the visible items by category (enum order), each chunked into rows of
  // `columns` (2 comfortable, 3 compact — the chunk size follows the density).
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
      return [{ title: strings.closet.categoryLabel(cat), data: chunk(list, columns) }];
    });
  }, [visible, columns]);

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
          {/* Signature decision #13: Ovi's living orb greets the blank closet —
              the shared dimensional sphere at idle breath, static under reduced
              motion. Purely ornamental, so it's hidden from assistive tech. */}
          <ClosetGreetingOrb />
          <Text
            accessibilityRole="header"
            variant="largeTitle"
            color={colors.text}
            style={styles.centerCopy}
          >
            {strings.closet.emptySignature}
          </Text>
          <View style={styles.emptyActions}>
            <Button label={strings.closet.addCta} onPress={goAdd} haptic />
          </View>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <ScreenEntrance>
      <SafeAreaView style={[styles.screen, { backgroundColor: colors.bg }]} edges={['top']}>
        {/* One device-tilt sensor for the whole grid — the tiles breathe with
            the wrist at half strength; the touched tile's drag-tilt sums on top.
            Gated on focus so the sensor stops when the tab is left. */}
        <TiltFieldProvider active={focused}>
        <AnimatedSectionList
          sections={sections}
          onScroll={visibility?.scrollHandler}
          scrollEventThrottle={16}
          keyExtractor={(row, index) => `${row[0]?.id ?? 'row'}-${index}`}
          renderItem={({ item: row, index }) => (
            <GalleryRow
              row={row}
              index={index}
              rowGap={rowGap}
              columns={columns}
              cascade={cascade}
              onPress={openDetail}
            />
          )}
          renderSectionHeader={({ section }) => (
            <SectionLabel title={section.title} />
          )}
          ListHeaderComponent={
            <>
              <PageHeader title="Closet" subtitle={strings.closet.pieceCount(items.length)} />
              <ClosetHeader
                search={search}
                onSearch={setSearch}
                categories={categories}
                selected={category}
                onSelect={setCategory}
                density={density}
                onDensity={onDensity}
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
        </TiltFieldProvider>
      </SafeAreaView>
    </ScreenEntrance>
  );
}

/**
 * One gallery row of up to `columns` tiles. On the first stocked render of the
 * session (`cascade`) it wraps in StaggerItem for the 45ms rise-in; afterwards it
 * renders the plain row so a re-focus is instant. Short rows pad with empty cells
 * so a trailing tile keeps its column width instead of stretching.
 */
function GalleryRow({
  row,
  index,
  rowGap,
  columns,
  cascade,
  onPress,
}: {
  readonly row: readonly ItemWithDisplay[];
  readonly index: number;
  readonly rowGap: number;
  readonly columns: number;
  readonly cascade: boolean;
  readonly onPress: (item: ItemWithDisplay) => void;
}) {
  const body = (
    <View style={[styles.row, { marginBottom: rowGap }]}>
      {row.map((tile) => (
        <View key={tile.id} style={styles.cell}>
          <CutoutTile item={tile} onPress={onPress} />
        </View>
      ))}
      {row.length < columns
        ? Array.from({ length: columns - row.length }, (_, i) => <View key={`pad-${i}`} style={styles.cell} />)
        : null}
    </View>
  );
  return cascade ? <StaggerItem index={index}>{body}</StaggerItem> : body;
}

/**
 * An editorial category label: the plural heading in Fraunces Italic (oviAccent,
 * at its title3 default = 20px, clearing the serif floor) followed by a 1px
 * hairline rule that fills the rest of the row — a magazine section marker, not a
 * spreadsheet header. Sticky headers stay OFF (set on the list), and the label
 * carries the page background so scrolled content never bleeds behind it.
 */
function SectionLabel({ title }: { readonly title: string }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.sectionHeader, { backgroundColor: colors.bg }]}>
      <Text variant="oviAccent" color={colors.text}>
        {title}
      </Text>
      <View style={[styles.sectionRule, { backgroundColor: colors.hairline }]} />
    </View>
  );
}

/**
 * ClosetGreetingOrb — the empty closet's signature greeting (decision #13). The
 * shared living {@link OviOrb} at rest (idle breath), kept at its historical
 * `spacing.s6` size. Purely decorative, so it is hidden from assistive tech and
 * the copy beneath carries the meaning.
 */
function ClosetGreetingOrb() {
  return (
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <OviOrb state="idle" sizePx={spacing.s6} />
    </View>
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
    // Horizontal gap stays the comfortable gutter (12) at both densities; the
    // vertical row gap is applied per-row from the density (`rowGap`).
    flexDirection: 'row',
    gap: layout.grid.gutter,
  },
  cell: {
    flex: 1,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s3,
    paddingTop: spacing.s4,
    paddingBottom: spacing.s3,
  },
  // The hairline rule that runs from the label to the row's edge — 1px,
  // vertically centred with the italic label, filling the remaining width.
  sectionRule: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
  },
  centerCopy: {
    textAlign: 'center',
  },
});
