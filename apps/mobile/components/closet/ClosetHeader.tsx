/**
 * ClosetHeader — the gallery's sticky top matter.
 *
 * A large "Closet" title, the public/private toggle, a debounced search field,
 * and a horizontal row of category filter chips ("All" plus every category the
 * closet actually holds). Search and filter are lifted to the screen; this is a
 * controlled presenter. Rendered as the SectionList header.
 */
import { strings } from '@era/core/strings';
import { spacing } from '@era/tokens';
import { ScrollView, StyleSheet, View } from 'react-native';

import { Chip } from '@/components/Chip';
import { Input } from '@/components/Input';
import { Text } from '@/components/Text';
import type { ItemCategory } from '@/components/items/constants';
import { useTheme } from '@/lib/theme';

import { PrivacyToggle } from './PrivacyToggle';
import { SettingsGear } from './SettingsGear';
import { WearHistoryButton } from './WearHistoryButton';

interface ClosetHeaderProps {
  readonly search: string;
  readonly onSearch: (value: string) => void;
  /** Categories the closet actually holds, in enum order. */
  readonly categories: readonly ItemCategory[];
  /** The active category filter, or null for "All". */
  readonly selected: ItemCategory | null;
  readonly onSelect: (category: ItemCategory | null) => void;
  /** Open the settings screen (the gear beside the title). */
  readonly onOpenSettings: () => void;
  /** Open the wear calendar (the glyph beside the gear). */
  readonly onOpenWorn: () => void;
}

export function ClosetHeader({
  search,
  onSearch,
  categories,
  selected,
  onSelect,
  onOpenSettings,
  onOpenWorn,
}: ClosetHeaderProps) {
  const { colors } = useTheme();

  return (
    <View style={styles.container}>
      <View style={styles.titleRow}>
        <Text accessibilityRole="header" variant="largeTitle" color={colors.text}>
          Closet
        </Text>
        <View style={styles.actions}>
          <WearHistoryButton onPress={onOpenWorn} />
          <SettingsGear onPress={onOpenSettings} />
        </View>
      </View>

      <PrivacyToggle />

      <Input
        value={search}
        onChangeText={onSearch}
        placeholder={strings.closet.searchPlaceholder}
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType="search"
        accessibilityLabel={strings.closet.searchPlaceholder}
      />

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chips}
      >
        <Chip label={strings.closet.filterAll} selected={selected === null} onToggle={() => onSelect(null)} />
        {categories.map((category) => (
          <Chip
            key={category}
            label={strings.closet.categoryLabel(category)}
            selected={selected === category}
            onToggle={() => onSelect(selected === category ? null : category)}
          />
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.s4,
    paddingBottom: spacing.s4,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s2,
  },
  chips: {
    flexDirection: 'row',
    gap: spacing.s2,
    paddingRight: spacing.s4,
  },
});
