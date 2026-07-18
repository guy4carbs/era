/**
 * ClosetDrawer — the bottom sheet of closet pieces the canvas pulls from.
 *
 * Rendered inside a {@link GlassSheet}. A search field plus category chips filter
 * the caller's closet; tapping a tile drops that piece onto the canvas (centered,
 * top layer) with a selection tick. Pieces already on the canvas are dimmed and
 * disabled — an item appears at most once in an outfit (the itemId is its key).
 */
import { strings } from '@era/core/strings';
import { layout, radii, spacing } from '@era/tokens';
import * as Haptics from 'expo-haptics';
import { useMemo, useState } from 'react';
import { Image, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';

import { Chip } from '@/components/Chip';
import { Input } from '@/components/Input';
import { GlassSheet } from '@/components/GlassSheet';
import { Press } from '@/components/Press';
import type { ItemWithDisplay } from '@/components/items';
import { CATEGORIES, type ItemCategory } from '@/components/items/constants';
import { useDebouncedValue } from '@/lib/use-debounced-value';
import { useTheme } from '@/lib/theme';

interface ClosetDrawerProps {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly items: readonly ItemWithDisplay[];
  /** Item ids already placed on the canvas — dimmed and disabled here. */
  readonly placedIds: ReadonlySet<string>;
  readonly onAdd: (item: ItemWithDisplay) => void;
}

/** Pieces per row in the drawer grid — one denser than the closet's 2-up gallery. */
const DRAWER_COLUMNS = layout.grid.mobileColumns + 1;

export function ClosetDrawer({ open, onClose, items, placedIds, onAdd }: ClosetDrawerProps) {
  const { colors } = useTheme();
  const { width } = useWindowDimensions();
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<ItemCategory | null>(null);
  const query = useDebouncedValue(search.trim().toLowerCase(), 200);

  // Sheet body is inset by spacing.s4 each side; fit DRAWER_COLUMNS with gutters.
  const tileWidth =
    (width - spacing.s4 * 2 - spacing.s3 * (DRAWER_COLUMNS - 1)) / DRAWER_COLUMNS;

  // Categories the closet actually holds, in enum order — drives the chips.
  const categories = useMemo(
    () => CATEGORIES.filter((cat) => items.some((item) => item.category === cat)),
    [items],
  );

  const visible = useMemo(
    () =>
      items.filter(
        (item) =>
          (category === null || item.category === category) && matchesQuery(item, query),
      ),
    [items, category, query],
  );

  return (
    <GlassSheet open={open} onClose={onClose}>
      <Input
        placeholder={strings.design.drawerSearchPlaceholder}
        value={search}
        onChangeText={setSearch}
        autoCorrect={false}
        returnKeyType="search"
      />
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chips}
        keyboardShouldPersistTaps="handled"
      >
        <Chip
          label={strings.closet.filterAll}
          selected={category === null}
          onToggle={() => setCategory(null)}
        />
        {categories.map((cat) => (
          <Chip
            key={cat}
            label={strings.closet.categoryLabel(cat)}
            selected={category === cat}
            onToggle={() => setCategory(cat)}
          />
        ))}
      </ScrollView>

      <ScrollView
        contentContainerStyle={styles.grid}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {visible.map((item) => {
          const placed = placedIds.has(item.id);
          return (
            <Press
              key={item.id}
              accessibilityRole="button"
              accessibilityLabel={item.name}
              accessibilityState={{ disabled: placed }}
              disabled={placed}
              onPress={() => {
                void Haptics.selectionAsync();
                onAdd(item);
              }}
              style={[
                styles.tile,
                {
                  width: tileWidth,
                  backgroundColor: colors.surface,
                  borderColor: colors.hairline,
                  borderRadius: radii.card,
                  opacity: placed ? 0.4 : 1,
                },
              ]}
            >
              {item.displayUrl ? (
                <Image
                  source={{ uri: item.displayUrl }}
                  style={styles.image}
                  resizeMode="contain"
                  accessible={false}
                />
              ) : (
                <View style={styles.image} />
              )}
            </Press>
          );
        })}
      </ScrollView>
    </GlassSheet>
  );
}

/** True when the query is empty or matches the item's name, brand, or category. */
function matchesQuery(item: ItemWithDisplay, query: string): boolean {
  if (query.length === 0) {
    return true;
  }
  const haystack = [item.name, item.brand ?? '', strings.closet.categoryLabel(item.category)]
    .join(' ')
    .toLowerCase();
  return haystack.includes(query);
}

const styles = StyleSheet.create({
  chips: {
    gap: spacing.s2,
    paddingVertical: spacing.s3,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.s3,
    paddingBottom: spacing.s8,
  },
  tile: {
    aspectRatio: layout.itemCard.ratio,
    borderWidth: StyleSheet.hairlineWidth,
    borderCurve: 'continuous',
    overflow: 'hidden',
    padding: spacing.s2,
  },
  image: {
    flex: 1,
    width: '100%',
  },
});
