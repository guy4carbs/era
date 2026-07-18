/**
 * Button — primary / secondary / ghost.
 *
 * Min height honours the iOS touch-target token; press applies a snappy scale
 * via Reanimated (a short fade under reduced motion). Pass `haptic` to fire a
 * light impact on press (used for outfit-save per spec).
 */
import { layout, radii, sheen, spacing } from '@era/tokens';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
} from 'react-native-reanimated';
import { Pressable } from 'react-native';

import { Text, TextControlBoundary } from '@/components/Text';
import { PRESS_SCALE, animate, useReducedMotionSafe } from '@/lib/motion';
import { useTheme } from '@/lib/theme';

const REST_SCALE = 1;

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';

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
  const { colors, resolved } = useTheme();
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
          colors={[sheen.from[resolved], sheen.to]}
          locations={[0, 0.6]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          pointerEvents="none"
          style={[StyleSheet.absoluteFill, { borderRadius: radii.input, zIndex: 1 }]}
        />
      ) : null}
      <TextControlBoundary>
        <Text variant="ui" size="body" color={skin.foreground} style={{ zIndex: 2 }}>
          {label}
        </Text>
      </TextControlBoundary>
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
    case 'danger':
      // Rust-outline for destructive confirms — the danger token carries the
      // signal (it already meets contrast on bg/surface as the Input error hue),
      // in both light and dark. Mirrors web's rust-outline delete button.
      return {
        background: 'transparent',
        foreground: colors.danger,
        border: colors.danger,
        borderWidth: StyleSheet.hairlineWidth,
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
  disabled: {
    opacity: 0.5,
  },
});
