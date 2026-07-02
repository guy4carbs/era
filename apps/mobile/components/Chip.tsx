/**
 * Chip — selectable pill (used by the style quiz).
 *
 * Footnote type, guaranteed 44pt hit area via hitSlop, snappy toggle scale,
 * and a selection haptic tick on tap. Reduced motion swaps the spring for a
 * short fade.
 */
import { radii, spacing, typeRamp } from '@era/tokens';
import * as Haptics from 'expo-haptics';
import { Pressable, StyleSheet, Text } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
} from 'react-native-reanimated';

import { animate, useReducedMotionSafe } from '@/lib/motion';
import { useTheme } from '@/lib/theme';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

const PRESS_SCALE = 0.94;
const REST_SCALE = 1;
// Expands the touch area so a small chip still meets the 44pt target.
const HIT_SLOP = spacing.s3;

interface ChipProps {
  readonly label: string;
  readonly selected?: boolean;
  readonly onToggle?: (next: boolean) => void;
  readonly haptic?: boolean;
}

export function Chip({ label, selected = false, onToggle, haptic = true }: ChipProps) {
  const { colors } = useTheme();
  const reduced = useReducedMotionSafe();
  const scale = useSharedValue(REST_SCALE);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <AnimatedPressable
      accessibilityRole="button"
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
          backgroundColor: selected ? `${colors.accent}29` : colors.surface,
          borderColor: selected ? colors.accent : colors.hairline,
        },
        animatedStyle,
      ]}
    >
      <Text
        style={{
          color: colors.text,
          fontSize: typeRamp.footnote.pt,
          lineHeight: typeRamp.footnote.lineHeight,
        }}
      >
        {label}
      </Text>
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
