/**
 * ClosetHeader — the gallery's top chrome (below the PageHeader).
 *
 * The wear-history + settings toolbar (now joined by a quiet density toggle), the
 * public/private toggle, a debounced search field, and a horizontal row of
 * category filter chips ("All" plus every category the closet actually holds).
 * The screen's PageHeader (title + subtitle) sits ABOVE this. Search, filter, and
 * density are lifted to the screen; this is a controlled presenter. Rendered
 * inside the SectionList header.
 */
import { strings } from '@era/core/strings';
import { glass, radii, spacing } from '@era/tokens';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Input } from '@/components/Input';
import { Text, TextControlBoundary } from '@/components/Text';
import type { ItemCategory } from '@/components/items/constants';
import { useTheme } from '@/lib/theme';

import { PrivacyToggle } from './PrivacyToggle';
import { SettingsGear } from './SettingsGear';
import { WearHistoryButton } from './WearHistoryButton';

/** Grid density: `comfortable` (2 columns, roomy) | `compact` (3 columns, tight). */
export type ClosetDensity = 'comfortable' | 'compact';

interface ClosetHeaderProps {
  readonly search: string;
  readonly onSearch: (value: string) => void;
  /** Categories the closet actually holds, in enum order. */
  readonly categories: readonly ItemCategory[];
  /** The active category filter, or null for "All". */
  readonly selected: ItemCategory | null;
  readonly onSelect: (category: ItemCategory | null) => void;
  /** The active grid density. */
  readonly density: ClosetDensity;
  /** Toggle the grid density (comfortable ⇄ compact). */
  readonly onDensity: (density: ClosetDensity) => void;
  /** Open the settings screen (the gear in the toolbar). */
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
  density,
  onDensity,
  onOpenSettings,
  onOpenWorn,
}: ClosetHeaderProps) {
  return (
    <View style={styles.container}>
      <View style={styles.actions}>
        <DensityToggle density={density} onDensity={onDensity} />
        <WearHistoryButton onPress={onOpenWorn} />
        <SettingsGear onPress={onOpenSettings} />
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
        <FilterChip
          label={strings.closet.filterAll}
          selected={selected === null}
          onPress={() => onSelect(null)}
        />
        {categories.map((category) => (
          <FilterChip
            key={category}
            label={strings.closet.categoryLabel(category)}
            selected={selected === category}
            onPress={() => onSelect(selected === category ? null : category)}
          />
        ))}
      </ScrollView>
    </View>
  );
}

/**
 * The filter chips get a glass-QUIET treatment — deliberately WITHOUT a BlurView.
 * A real BlurView per chip in a horizontally-scrolling row would tank scroll
 * performance (each is a separate GPU blur pass), so instead we express the glass
 * idea as a plain translucent surface tint: `colors.surface` at the glass token's
 * per-mode `tintOpacity`, over a hairline border and the chip radius. Selected
 * keeps the accent treatment (16% accent tint + accent border) from the original
 * chip. This "glass without blur" divergence is intentional and load-bearing for
 * scroll perf. The tint alpha is derived from the theme + glass tokens (no raw
 * hex), so the design-token guard stays green.
 */
function FilterChip({
  label,
  selected,
  onPress,
}: {
  readonly label: string;
  readonly selected: boolean;
  readonly onPress: () => void;
}) {
  const { colors, resolved } = useTheme();
  // Two-hex-digit alpha suffix from the glass token's per-mode tint opacity —
  // e.g. 0.6 → "99" — so the quiet chip reads as a translucent glass surface
  // tint without a hex literal in source.
  const tintAlpha = alphaHex(glass.tintOpacity[resolved]);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={label}
      hitSlop={spacing.s3}
      onPress={onPress}
      style={[
        styles.chip,
        {
          backgroundColor: selected ? `${colors.accent}29` : `${colors.surface}${tintAlpha}`,
          borderColor: selected ? colors.accent : colors.hairline,
        },
      ]}
    >
      <TextControlBoundary>
        <Text variant="ui" size="footnote" color={colors.text}>
          {label}
        </Text>
      </TextControlBoundary>
    </Pressable>
  );
}

/**
 * A quiet density toggle following the toolbar's icon-button idiom (small, muted,
 * 44pt hit area, no shout). One control flips comfortable ⇄ compact; the glyph
 * shows the density the tap will apply, and the a11y label + `checked` state
 * announce the current one. Purely presentational glyphs (grid dots), so the
 * label carries the meaning.
 */
function DensityToggle({
  density,
  onDensity,
}: {
  readonly density: ClosetDensity;
  readonly onDensity: (density: ClosetDensity) => void;
}) {
  const { colors } = useTheme();
  const next: ClosetDensity = density === 'comfortable' ? 'compact' : 'comfortable';
  const current =
    density === 'comfortable' ? strings.closet.densityComfortable : strings.closet.densityCompact;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ checked: density === 'compact' }}
      accessibilityLabel={`${strings.closet.densityLabel}: ${current}`}
      hitSlop={spacing.s3}
      onPress={() => onDensity(next)}
      style={styles.iconButton}
    >
      <Text variant="ui" size="subhead" color={colors.secondaryStrong}>
        {density === 'comfortable' ? '▦' : '▤'}
      </Text>
    </Pressable>
  );
}

/** A 0–1 opacity as a 2-digit hex alpha suffix (`0.6` → `"99"`). */
function alphaHex(opacity: number): string {
  const clamped = Math.max(0, Math.min(1, opacity));
  return Math.round(clamped * 255)
    .toString(16)
    .padStart(2, '0');
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.s4,
    paddingBottom: spacing.s4,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: spacing.s2,
  },
  iconButton: {
    minWidth: spacing.s6,
    minHeight: spacing.s6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chips: {
    flexDirection: 'row',
    gap: spacing.s2,
    paddingRight: spacing.s4,
  },
  chip: {
    alignSelf: 'flex-start',
    borderRadius: radii.chip,
    borderWidth: StyleSheet.hairlineWidth,
    borderCurve: 'continuous',
    paddingVertical: spacing.s2,
    paddingHorizontal: spacing.s3,
  },
});
