/**
 * Button — primary / secondary / ghost.
 *
 * Min height honours the iOS touch-target token; press applies a snappy scale
 * via Reanimated (a short fade under reduced motion). Pass `haptic` to fire a
 * light impact on press (used for outfit-save per spec).
 */
import { layout, radii, sheen, spacing, typeRamp } from '@era/tokens';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, Text, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
} from 'react-native-reanimated';
import { Pressable } from 'react-native';

import { animate, useReducedMotionSafe } from '@/lib/motion';
import { useTheme } from '@/lib/theme';

// No token exists for press-feedback scale; kept local. See contract-gap notes.
const PRESS_SCALE = 0.97;
const REST_SCALE = 1;

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

type Variant = 'primary' | 'secondary' | 'ghost';

interface ButtonProps {
  readonly label: string;
  readonly onPress?: () => void;
  readonly variant?: Variant;
  readonly disabled?: boolean;
  /** Fire a light impact haptic on press. */
  readonly haptic?: boolean;
  readonly accessibilityLabel?: string;
  readonly style?: StyleProp<ViewStyle>;
}

export function Button({
  label,
  onPress,
  variant = 'primary',
  disabled = false,
  haptic = false,
  accessibilityLabel,
  style,
}: ButtonProps) {
  const { colors } = useTheme();
  const reduced = useReducedMotionSafe();
  const scale = useSharedValue(REST_SCALE);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const skin = variantSkin(variant, colors);

  return (
    <AnimatedPressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPressIn={() => {
        scale.value = animate(PRESS_SCALE, reduced, 'snappy');
      }}
      onPressOut={() => {
        scale.value = animate(REST_SCALE, reduced, 'snappy');
      }}
      onPress={() => {
        if (haptic) {
          void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        }
        onPress?.();
      }}
      style={[
        styles.base,
        {
          minHeight: layout.touchTarget.ios,
          paddingHorizontal: spacing.s4,
          borderRadius: radii.input,
          overflow: 'hidden',
          backgroundColor: skin.background,
          borderColor: skin.border,
          borderWidth: skin.borderWidth,
        },
        disabled && styles.disabled,
        animatedStyle,
        style,
      ]}
    >
      {variant === 'primary' ? (
        // Diagonal specular sheen (135°), item-card + primary only per spec.
        <LinearGradient
          colors={[sheen.from, sheen.to]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          pointerEvents="none"
          style={[StyleSheet.absoluteFill, { borderRadius: radii.input, zIndex: 1 }]}
        />
      ) : null}
      <Text
        style={[
          styles.label,
          { zIndex: 2 },
          {
            color: skin.foreground,
            fontSize: typeRamp.body.pt,
            lineHeight: typeRamp.body.lineHeight,
          },
        ]}
      >
        {label}
      </Text>
    </AnimatedPressable>
  );
}

function variantSkin(variant: Variant, colors: ReturnType<typeof useTheme>['colors']) {
  switch (variant) {
    case 'primary':
      return {
        background: colors.accent,
        foreground: colors.bg,
        border: colors.accent,
        borderWidth: 0,
      };
    case 'secondary':
      return {
        background: colors.surface,
        foreground: colors.text,
        border: colors.hairline,
        borderWidth: StyleSheet.hairlineWidth,
      };
    case 'ghost':
      return {
        background: 'transparent',
        foreground: colors.accent,
        border: 'transparent',
        borderWidth: 0,
      };
  }
}

const styles = StyleSheet.create({
  base: {
    alignItems: 'center',
    justifyContent: 'center',
    // iOS squircle per spec — applied to every rounded surface.
    borderCurve: 'continuous',
  },
  label: {
    fontWeight: '600',
  },
  disabled: {
    opacity: 0.5,
  },
});
