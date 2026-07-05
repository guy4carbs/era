/**
 * ShopFilters — the frosted filter sheet.
 *
 * Four tap-only dimensions in a `GlassSheet`: brand tier, category, budget band,
 * and size. Each is single-select — tapping the active chip clears it — and every
 * change flows straight up via `onChange`, so the grid re-queries live (no Apply
 * step). Size is the one free-entry field (a plain `Input`). "Clear filters" resets
 * everything at once. All copy comes from `strings.shop` / `strings.closet`; all
 * colour and spacing from tokens.
 */
import { strings } from '@era/core/strings';
import type { BrandTier, ItemCategory } from '@era/core/shop';
import { spacing, typeRamp } from '@era/tokens';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/Button';
import { Chip } from '@/components/Chip';
import { GlassSheet } from '@/components/GlassSheet';
import { Input } from '@/components/Input';
import { CATEGORIES } from '@/components/items/constants';
import { useTheme } from '@/lib/theme';

import {
  BRAND_TIERS,
  BUDGET_BANDS,
  budgetBandLabel,
  EMPTY_FILTERS,
  type ShopFilterState,
} from './filters';
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
  const setSize = (size: string) => onChange({ ...filters, size });

  return (
    <GlassSheet open={open} onClose={onClose}>
      <ScrollView
        contentContainerStyle={styles.body}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <Section title={strings.shop.filterBrandTier}>
          {BRAND_TIERS.map((tier) => (
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
              label={budgetBandLabel(band)}
              selected={filters.budgetId === band.id}
              onToggle={() => setBudget(band.id)}
            />
          ))}
        </Section>

        <Section title={strings.shop.filterSize}>
          <Input
            value={filters.size}
            onChangeText={setSize}
            autoCapitalize="characters"
            autoCorrect={false}
            containerStyle={styles.sizeInput}
            accessibilityLabel={strings.shop.filterSize}
          />
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
      <Text
        style={{
          color: colors.secondaryStrong,
          fontSize: typeRamp.subhead.pt,
          lineHeight: typeRamp.subhead.lineHeight,
          fontWeight: '600',
        }}
      >
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
  sizeInput: {
    alignSelf: 'stretch',
  },
});
