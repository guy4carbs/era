/**
 * SizesSettings — the Settings editor for the three saved body sizes (apparel,
 * denim/waist, shoe) that prefill a piece's size at checkout. Reads the saved
 * sizes on mount and renders a chip row per dimension; tapping a chip writes the
 * merged triple back via PUT, optimistically (the chip flips instantly, then the
 * write runs; a failure reverts and raises an honest toast). Only mounted by the
 * Settings screen when the cosmetic checkout flag is on. Mirrors the
 * {@link ReceiptAddressSettings} section shape (explainer + controls + honest
 * failure), reading its copy from the mobile-local checkout copy gap.
 */
import { spacing, typeRamp } from '@era/tokens';
import { strings } from '@era/core/strings';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { useTheme } from '@/lib/theme';

import { SizeChoiceRow } from '@/components/checkout/SizeChoiceRow';
import { getSizes, putSizes, type UserSizes } from '@/components/checkout/api';
import { checkoutCopy } from '@/components/checkout/copy';

interface SizesSettingsProps {
  /** Raise a transient failure line on the screen's toast. */
  readonly onToast: (message: string) => void;
}

const EMPTY_SIZES: UserSizes = { apparelSize: null, denimSize: null, shoeSize: null };

export function SizesSettings({ onToast }: SizesSettingsProps) {
  const { colors } = useTheme();
  const [sizes, setSizes] = useState<UserSizes>(EMPTY_SIZES);

  useEffect(() => {
    let active = true;
    void getSizes().then((next) => {
      if (active) setSizes(next);
    });
    return () => {
      active = false;
    };
  }, []);

  // Optimistically flip the chip, then persist the merged triple. A failed write
  // reverts to the prior sizes and owns the miss with a toast.
  const update = (patch: Partial<UserSizes>) => {
    const prev = sizes;
    const next = { ...sizes, ...patch };
    setSizes(next);
    void putSizes(next).catch(() => {
      setSizes(prev);
      onToast(strings.errors.generic);
    });
  };

  return (
    <View style={styles.container}>
      <Text style={caption(colors.secondaryStrong)}>{checkoutCopy.sizesExplain}</Text>

      <View style={styles.dimension}>
        <Text style={label(colors.secondaryStrong)}>{checkoutCopy.apparelLabel}</Text>
        <SizeChoiceRow
          kind="apparel"
          selected={sizes.apparelSize}
          onSelect={(size) => update({ apparelSize: size })}
        />
      </View>

      <View style={styles.dimension}>
        <Text style={label(colors.secondaryStrong)}>{checkoutCopy.denimLabel}</Text>
        <SizeChoiceRow
          kind="denim"
          selected={sizes.denimSize}
          onSelect={(size) => update({ denimSize: size })}
        />
      </View>

      <View style={styles.dimension}>
        <Text style={label(colors.secondaryStrong)}>{checkoutCopy.shoeLabel}</Text>
        <SizeChoiceRow
          kind="shoe"
          selected={sizes.shoeSize}
          onSelect={(size) => update({ shoeSize: size })}
        />
      </View>
    </View>
  );
}

function caption(color: string) {
  return {
    color,
    fontSize: typeRamp.footnote.pt,
    lineHeight: typeRamp.footnote.lineHeight,
  } as const;
}

function label(color: string) {
  return {
    color,
    fontSize: typeRamp.footnote.pt,
    lineHeight: typeRamp.footnote.lineHeight,
    fontWeight: '600',
    textTransform: 'uppercase',
  } as const;
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.s4,
  },
  dimension: {
    gap: spacing.s2,
  },
});
