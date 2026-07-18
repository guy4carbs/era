/**
 * ShopFilters — the frosted filter sheet.
 *
 * Four tap-only dimensions in a `GlassSheet`: brand tier, category, budget band,
 * and size — all single-select chips (tapping the active chip clears it), every
 * change flowing straight up via `onChange` so the grid re-queries live (no Apply
 * step). The chip data (budget bands, size presets, tier order) comes from the
 * canonical `@era/core/shop` constants so mobile matches web exactly. "Clear
 * filters" resets everything at once. All copy comes from `strings.shop` /
 * `strings.closet`; all colour and spacing from tokens.
 */
import { strings } from '@era/core/strings';
import type { BrandTier, ItemCategory } from '@era/core/shop';
import { BRAND_TIER_ORDER, BUDGET_BANDS, SIZE_OPTIONS } from '@era/core/shop';
import { spacing } from '@era/tokens';
import { ScrollView, StyleSheet, View } from 'react-native';

import { Button } from '@/components/Button';
import { Text } from '@/components/Text';
import { Chip } from '@/components/Chip';
import { GlassSheet } from '@/components/GlassSheet';
import { CATEGORIES } from '@/components/items/constants';
import { useTheme } from '@/lib/theme';

import { EMPTY_FILTERS, type ShopFilterState } from './filters';
import { brandTierLabel } from './labels';

interface ShopFiltersProps {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly filters: ShopFilterState;
  readonly onChange: (next: ShopFilterState) => void;
}

export function ShopFilters({ open, onClose, filters, onChange }: ShopFiltersProps) {
  // Single-select toggles: re-tapping the active value clears that dimension.
  const setTier = (tier: BrandTier) =>
    onChange({ ...filters, brandTier: filters.brandTier === tier ? null : tier });
  const setCategory = (category: ItemCategory) =>
    onChange({ ...filters, category: filters.category === category ? null : category });
  const setBudget = (id: string) =>
    onChange({ ...filters, budgetId: filters.budgetId === id ? null : id });
  const setSize = (size: string) =>
    onChange({ ...filters, size: filters.size === size ? '' : size });

  return (
    <GlassSheet open={open} onClose={onClose}>
      <ScrollView
        contentContainerStyle={styles.body}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <Section title={strings.shop.filterBrandTier}>
          {BRAND_TIER_ORDER.map((tier) => (
            <Chip
              key={tier}
              label={brandTierLabel(tier)}
              selected={filters.brandTier === tier}
              onToggle={() => setTier(tier)}
            />
          ))}
        </Section>

        <Section title={strings.shop.filterCategory}>
          {CATEGORIES.map((category) => (
            <Chip
              key={category}
              label={strings.closet.categoryLabel(category)}
              selected={filters.category === category}
              onToggle={() => setCategory(category)}
            />
          ))}
        </Section>

        <Section title={strings.shop.filterBudget}>
          {BUDGET_BANDS.map((band) => (
            <Chip
              key={band.id}
              label={band.label}
              selected={filters.budgetId === band.id}
              onToggle={() => setBudget(band.id)}
            />
          ))}
        </Section>

        <Section title={strings.shop.filterSize}>
          {SIZE_OPTIONS.map((size) => (
            <Chip
              key={size}
              label={size}
              selected={filters.size === size}
              onToggle={() => setSize(size)}
            />
          ))}
        </Section>

        <Button
          label={strings.shop.clearFilters}
          variant="secondary"
          onPress={() => onChange(EMPTY_FILTERS)}
        />
      </ScrollView>
    </GlassSheet>
  );
}

/** A titled group of filter controls (chips or an input) that wrap onto rows. */
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const { colors } = useTheme();
  return (
    <View style={styles.section}>
      <Text variant="ui" size="subhead" weight={600} color={colors.secondaryStrong}>
        {title}
      </Text>
      <View style={styles.chipRow}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  body: {
    gap: spacing.s6,
    paddingBottom: spacing.s6,
  },
  section: {
    gap: spacing.s3,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.s2,
  },
});
