/**
 * OviFab — the floating button for Ovi, the AI stylist.
 *
 * An accent circle with a soft accent-coloured glow (an iOS shadow tinted with
 * the accent colour). It breathes with a slow 3s pulse (scale + glow opacity,
 * ±`glow.pulse.amount`). Reduced motion pins it static — no pulse. Press gives
 * a snappy scale and a light haptic.
 */
import { glow, layout, typeRamp } from '@era/tokens';
import { strings } from '@era/core/strings';
import * as Haptics from 'expo-haptics';
import { useEffect } from 'react';
import { Pressable, StyleSheet, Text, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { animate, useReducedMotionSafe } from '@/lib/motion';
import { useTheme } from '@/lib/theme';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

const DIAMETER = layout.touchTarget.ios;
const PRESS_SCALE = 0.92;
const REST_SCALE = 1;

interface OviFabProps {
  readonly onPress?: () => void;
  readonly style?: StyleProp<ViewStyle>;
}

export function OviFab({ onPress, style }: OviFabProps) {
  const { colors, resolved } = useTheme();
  const reduced = useReducedMotionSafe();

  const baseGlowOpacity = glow.opacity[resolved];
  const pulse = useSharedValue(0);
  const press = useSharedValue(REST_SCALE);

  useEffect(() => {
    if (reduced) {
      pulse.value = 0;
      return;
    }
    // 0 → 1 → 0 over `pulse.durationMs`; each timing leg is half the period.
    pulse.value = withRepeat(
      withTiming(1, { duration: glow.pulse.durationMs / 2 }),
      -1,
      true,
    );
  }, [reduced, pulse]);

  const animatedStyle = useAnimatedStyle(() => {
    const breatheScale = 1 + pulse.value * glow.pulse.amount;
    return {
      transform: [{ scale: press.value * breatheScale }],
      shadowOpacity: interpolate(
        pulse.value,
        [0, 1],
        [baseGlowOpacity, baseGlowOpacity * (1 + glow.pulse.amount)],
      ),
    };
  });

  return (
    <AnimatedPressable
      accessibilityRole="button"
      accessibilityLabel={strings.ovi.fabLabel}
      onPressIn={() => {
        press.value = animate(PRESS_SCALE, reduced, 'snappy');
      }}
      onPressOut={() => {
        press.value = animate(REST_SCALE, reduced, 'snappy');
      }}
      onPress={() => {
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onPress?.();
      }}
      style={[
        styles.base,
        {
          width: DIAMETER,
          height: DIAMETER,
          borderRadius: DIAMETER / 2,
          backgroundColor: colors.accent,
          shadowColor: colors.accent,
          shadowRadius: glow.blurRadius,
        },
        animatedStyle,
        style,
      ]}
    >
      <Text style={[styles.glyph, { color: colors.bg }]}>✦</Text>
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  base: {
    alignItems: 'center',
    justifyContent: 'center',
    // iOS glow: a coloured, centred shadow. Android shows no tinted glow.
    shadowOffset: { width: 0, height: 0 },
  },
  glyph: {
    fontSize: typeRamp.title3.px,
    fontWeight: '600',
  },
});
