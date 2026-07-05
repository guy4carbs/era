/**
 * WhyLabel — the honest one-line reason a pick is shown.
 *
 * Positive pulls (`fills_gap`, `completes_outfits`) render as a calm accent-tinted
 * pill. `similar_owned` is the trust rule made visible: it renders as a CAUTION —
 * a rust-tinted pill with a rust hairline — because the closet may already hold
 * something like this. It is a warning, never a pitch. The label text always uses
 * the high-contrast `text` colour so the caution reads through its tint safely;
 * the rust framing carries the signal.
 */
import type { ProductWhy } from '@era/core/shop';
import { radii, spacing, typeRamp } from '@era/tokens';
import { StyleSheet, Text, View } from 'react-native';

import { useTheme } from '@/lib/theme';

import { resolveWhy } from './labels';

// Subtle fill tint (~12% alpha) behind the pill, matching the quiet-luxury chips.
const TINT_ALPHA = '1F';

interface WhyLabelProps {
  readonly why: ProductWhy;
}

export function WhyLabel({ why }: WhyLabelProps) {
  const { colors } = useTheme();
  const { text, caution } = resolveWhy(why);

  const tint = caution ? colors.danger : colors.accent;
  const border = caution ? colors.danger : colors.hairline;

  return (
    <View
      accessibilityRole="text"
      style={[
        styles.pill,
        {
          backgroundColor: `${tint}${TINT_ALPHA}`,
          borderColor: border,
          borderRadius: radii.chip,
        },
      ]}
    >
      <Text
        style={{
          color: colors.text,
          fontSize: typeRamp.footnote.pt,
          lineHeight: typeRamp.footnote.lineHeight,
          fontWeight: caution ? '600' : '400',
        }}
      >
        {text}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    alignSelf: 'flex-start',
    paddingVertical: spacing.s1,
    paddingHorizontal: spacing.s2,
    borderWidth: StyleSheet.hairlineWidth,
    borderCurve: 'continuous',
  },
});
