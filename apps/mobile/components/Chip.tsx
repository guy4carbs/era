/**
 * Chip — selectable pill (used by the style quiz).
 *
 * Footnote type, guaranteed 44pt hit area via hitSlop, snappy toggle scale,
 * and a selection haptic tick on tap. Reduced motion swaps the spring for a
 * short fade.
 */
import { glass, radii, spacing } from '@era/tokens';
import * as Haptics from 'expo-haptics';
import { Pressable, StyleSheet, type AccessibilityRole } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
} from 'react-native-reanimated';

import { Text, TextControlBoundary } from '@/components/Text';
import { PRESS_SCALE, animate, useReducedMotionSafe } from '@/lib/motion';
import { useTheme } from '@/lib/theme';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

const REST_SCALE = 1;
// Expands the touch area so a small chip still meets the 44pt target.
const HIT_SLOP = spacing.s3;

/** A 0–1 opacity as the 2-digit alpha suffix for an `#RRGGBB` colour (the same
 *  `${color}AA` idiom the selected tint already uses). */
function toAlphaHex(opacity: number): string {
  return Math.round(opacity * 255)
    .toString(16)
    .padStart(2, '0');
}

interface ChipProps {
  readonly label: string;
  readonly selected?: boolean;
  readonly onToggle?: (next: boolean) => void;
  readonly haptic?: boolean;
  /**
   * A11y role override — defaults to 'button'. A one-of-many group (e.g. the
   * theme picker) passes 'radio' so it announces "selected, 1 of 3".
   */
  readonly accessibilityRole?: AccessibilityRole;
  /**
   * Quiet glass treatment (mirrors the web Chip's `glass` prop, D8/D3.2): the
   * unselected rest fill becomes the §3 glass TINT (surface at the mode's glass
   * opacity) over its hairline border, so the chip reads as frosted rather than a
   * flat card. Selected still takes the accent tint. Per the mobile glass note,
   * the per-chip surface omits its own BlurView (a blur node per pill janks in a
   * scrolling row) — it leans on the tint like the web recipe's tint layer, and
   * the sheet's own BlurView already frosts everything behind it.
   */
  readonly glass?: boolean;
}

export function Chip({
  label,
  selected = false,
  onToggle,
  haptic = true,
  accessibilityRole = 'button',
  glass: glassVariant = false,
}: ChipProps) {
  const { colors, resolved } = useTheme();
  const reduced = useReducedMotionSafe();
  const scale = useSharedValue(REST_SCALE);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  // The unselected fill: the glass tint (surface at the mode's glass opacity) for
  // the glass variant, else the solid surface card. Selected always overrides with
  // the 16% accent tint below.
  const restBackground = glassVariant
    ? `${colors.surface}${toAlphaHex(glass.tintOpacity[resolved])}`
    : colors.surface;

  return (
    <AnimatedPressable
      accessibilityRole={accessibilityRole}
      accessibilityState={{ selected }}
      accessibilityLabel={label}
      hitSlop={HIT_SLOP}
      onPressIn={() => {
        scale.value = animate(PRESS_SCALE, reduced, 'snappy');
      }}
      onPressOut={() => {
        scale.value = animate(REST_SCALE, reduced, 'snappy');
      }}
      onPress={() => {
        if (haptic) {
          void Haptics.selectionAsync();
        }
        onToggle?.(!selected);
      }}
      style={[
        styles.base,
        {
          borderRadius: radii.chip,
          paddingVertical: spacing.s2,
          paddingHorizontal: spacing.s3,
          // Selected reads as a 16% accent tint (accent + 0x29 alpha ≈ 16%),
          // matching the web chip rather than a solid accent fill.
          backgroundColor: selected ? `${colors.accent}29` : restBackground,
          borderColor: selected ? colors.accent : colors.hairline,
        },
        animatedStyle,
      ]}
    >
      <TextControlBoundary>
        <Text variant="ui" size="footnote" color={colors.text}>
          {label}
        </Text>
      </TextControlBoundary>
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  base: {
    alignSelf: 'flex-start',
    borderWidth: StyleSheet.hairlineWidth,
    borderCurve: 'continuous',
  },
});
