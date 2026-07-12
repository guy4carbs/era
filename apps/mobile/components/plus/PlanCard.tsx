/**
 * PlanCard — one selectable Era+ plan on the paywall.
 *
 * A tappable surface showing the plan name and the store-formatted price. The
 * plan label ("Monthly" / "Annual") carries the billing period, so there is no
 * separate cadence line, and there is deliberately NO "best value" badge — the
 * annual card is emphasised only through weight and the accent selection ring,
 * per the product bar (no pushy nudge). Selection is drawn with the accent
 * hairline + a filled radio dot. Colour, type, and spacing come from tokens only.
 * The price string is RevenueCat's already-localized value — rendered verbatim,
 * never composed — so it is the one piece of runtime data here, never copy.
 */
import { layout, radii, spacing, typeRamp } from '@era/tokens';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useTheme } from '@/lib/theme';

interface PlanCardProps {
  /** Plan name, from strings (e.g. "Annual") — conveys the billing period. */
  readonly label: string;
  /** Localized, store-formatted price from RevenueCat (e.g. "$59.88"). */
  readonly priceString: string;
  readonly selected: boolean;
  /** The visually emphasised plan (annual). */
  readonly primary?: boolean;
  readonly onSelect: () => void;
}

export function PlanCard({ label, priceString, selected, primary = false, onSelect }: PlanCardProps) {
  const { colors } = useTheme();

  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={`${label}, ${priceString}`}
      onPress={onSelect}
      style={[
        styles.card,
        {
          backgroundColor: colors.surface,
          borderRadius: radii.card,
          borderColor: selected ? colors.accent : colors.hairline,
          borderWidth: selected ? 2 : StyleSheet.hairlineWidth,
        },
      ]}
    >
      <View style={styles.leading}>
        <View style={[styles.radio, { borderColor: selected ? colors.accent : colors.secondary }]}>
          {selected ? <View style={[styles.radioDot, { backgroundColor: colors.accent }]} /> : null}
        </View>

        <Text
          style={{
            color: colors.text,
            fontSize: typeRamp.body.pt,
            lineHeight: typeRamp.body.lineHeight,
            fontWeight: primary ? '700' : '600',
          }}
        >
          {label}
        </Text>
      </View>

      <Text
        style={{
          color: colors.text,
          fontSize: typeRamp.title3.pt,
          lineHeight: typeRamp.title3.lineHeight,
          fontWeight: '700',
        }}
      >
        {priceString}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    minHeight: layout.touchTarget.ios,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.s3,
    paddingHorizontal: spacing.s4,
    borderCurve: 'continuous',
  },
  leading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s3,
    flexShrink: 1,
  },
  radio: {
    width: spacing.s4,
    height: spacing.s4,
    borderRadius: radii.chip,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioDot: {
    width: spacing.s2,
    height: spacing.s2,
    borderRadius: radii.chip,
  },
});
