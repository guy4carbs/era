/**
 * SizeChoiceRow — a wrapped row of selectable size {@link Chip}s for one body-size
 * dimension. Shared by the Settings sizes editor (three rows, one per dimension)
 * and the cart item's inline size picker. Single-select: tapping a chip reports it
 * as the new size; the currently-selected chip reads as selected. A `one_size`
 * kind yields no options, so the caller renders nothing.
 */
import type { SizeKind } from '@era/core/checkout';
import { spacing } from '@era/tokens';
import { StyleSheet, View } from 'react-native';

import { Chip } from '@/components/Chip';

import { sizeOptionsForKind } from '@/lib/checkout-logic';

interface SizeChoiceRowProps {
  readonly kind: SizeKind;
  readonly selected: string | null;
  readonly onSelect: (size: string) => void;
}

export function SizeChoiceRow({ kind, selected, onSelect }: SizeChoiceRowProps) {
  const options = sizeOptionsForKind(kind);
  if (options.length === 0) return null;
  return (
    <View style={styles.row}>
      {options.map((size) => (
        <Chip
          key={size}
          label={size}
          accessibilityRole="radio"
          selected={selected === size}
          onToggle={() => onSelect(size)}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.s2,
  },
});
