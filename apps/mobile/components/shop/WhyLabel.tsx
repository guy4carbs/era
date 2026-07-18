/**
 * WhyLabel — the honest one-line reason a pick is shown.
 *
 * Positive pulls (`fills_gap`, `completes_outfits`) render as a calm accent-tinted
 * pill. `similar_owned` is the trust rule made visible: it renders as a CAUTION —
 * a rust-tinted pill with a rust hairline — because the closet may already hold
 * something like this. It is a warning, never a pitch. The label text always uses
 * the high-contrast `text` colour so the caution reads through its tint safely;
 * the rust framing carries the signal.
 *
 * When the ranker also handed back a rich `whyDetail`, the card passes `onPress` so
 * the pill becomes a button that opens the why-detail sheet (Ovi's reasoning
 * grounded in the user's own closet). Without `onPress` it stays a static label —
 * a pick whose `why` names no owned piece has nothing to expand into.
 */
import type { ProductWhy } from '@era/core/shop';
import { strings } from '@era/core/strings';
import { radii, spacing } from '@era/tokens';
import { Pressable, StyleSheet, View } from 'react-native';

import { Text } from '@/components/Text';
import { useTheme } from '@/lib/theme';

import { resolveWhy } from './labels';

// Subtle fill tint (~12% alpha) behind the pill, matching the quiet-luxury chips.
const TINT_ALPHA = '1F';

interface WhyLabelProps {
  readonly why: ProductWhy;
  /** When set, the pill becomes a button opening the why-detail sheet. */
  readonly onPress?: () => void;
}

export function WhyLabel({ why, onPress }: WhyLabelProps) {
  const { colors } = useTheme();
  const { text, caution } = resolveWhy(why);

  const tint = caution ? colors.danger : colors.accent;
  const border = caution ? colors.danger : colors.hairline;

  const pillStyle = [
    styles.pill,
    {
      backgroundColor: `${tint}${TINT_ALPHA}`,
      borderColor: border,
      borderRadius: radii.chip,
    },
  ];
  const labelWeight = caution ? 600 : 400;

  // Static label when there's no detail to expand into.
  if (!onPress) {
    return (
      <View accessibilityRole="text" style={pillStyle}>
        <Text variant="ui" size="footnote" weight={labelWeight} color={colors.text}>
          {text}
        </Text>
      </View>
    );
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={text}
      accessibilityHint={strings.shop.whyDetail.title}
      hitSlop={spacing.s2}
      onPress={onPress}
      style={pillStyle}
    >
      <Text variant="ui" size="footnote" weight={labelWeight} color={colors.text}>
        {text}
      </Text>
    </Pressable>
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
