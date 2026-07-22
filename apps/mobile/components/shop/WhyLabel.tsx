/**
 * WhyLabel — the honest one-line reason a pick is shown, as OVI'S WHISPER.
 *
 * Every why kind now renders in the ambient whisper grammar (D-AMBIENT): a 20px
 * idle Ovi orb (decorative, hidden from assistive tech) beside the reason line in
 * Fraunces-Italic (`oviAccent` — the sanctioned small-serif exception). It reads
 * as Ovi speaking the reason, not a UI pill.
 *
 * The trust rule survives the restyle: `similar_owned` is a CAUTION, so its line
 * takes the rust `danger` hue and a rust hairline underline (rather than the calm
 * accent), and its orb sits at rest — Ovi flagging, never pitching. Positive pulls
 * (`fills_gap`, `completes_outfits`) render the line in the warm `text` ink with no
 * underline. The label text stays high-contrast either way.
 *
 * When the ranker handed back a rich `whyDetail`, the card passes `onPress` so the
 * whole whisper becomes a button opening the why-detail sheet (Ovi's reasoning
 * grounded in the user's own closet). Without `onPress` it stays a static line —
 * a pick whose `why` names no owned piece has nothing to expand into.
 */
import type { ProductWhy } from '@era/core/shop';
import { strings } from '@era/core/strings';
import { orb as orbToken, spacing } from '@era/tokens';
import { StyleSheet, View } from 'react-native';

import { OviOrb } from '@/components/ovi';
import { Press } from '@/components/Press';
import { Text } from '@/components/Text';
import { useTheme } from '@/lib/theme';

import { resolveWhy } from './labels';

interface WhyLabelProps {
  readonly why: ProductWhy;
  /** When set, the whisper becomes a button opening the why-detail sheet. */
  readonly onPress?: () => void;
}

export function WhyLabel({ why, onPress }: WhyLabelProps) {
  const { colors } = useTheme();
  const { text, caution } = resolveWhy(why);

  // Caution (similar_owned) speaks in the rust hue with a rust hairline underline;
  // positive pulls speak in the warm ink with no underline.
  const lineColor = caution ? colors.danger : colors.text;

  const body = (
    <View style={styles.row}>
      {/* Presence, not a control — the idle whisper orb, hidden from assistive
          tech (the line carries the meaning). */}
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        pointerEvents="none"
      >
        <OviOrb state="idle" sizePx={orbToken.size.whisperPx} />
      </View>
      <Text
        variant="oviAccent"
        size="subhead"
        color={lineColor}
        numberOfLines={2}
        style={[
          styles.line,
          caution
            ? { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.danger }
            : null,
        ]}
      >
        {text}
      </Text>
    </View>
  );

  // Static line when there's no detail to expand into.
  if (!onPress) {
    return (
      <View accessibilityRole="text" accessibilityLabel={text}>
        {body}
      </View>
    );
  }

  return (
    <Press
      accessibilityRole="button"
      accessibilityLabel={text}
      accessibilityHint={strings.shop.whyDetail.title}
      hitSlop={spacing.s2}
      onPress={onPress}
    >
      {body}
    </Press>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s2,
  },
  // The line takes the remaining width so a two-line reason wraps under itself
  // rather than shoving the orb. The rust underline only paints for caution.
  line: {
    flex: 1,
  },
});
