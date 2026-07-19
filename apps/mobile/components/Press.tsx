/**
 * Press — the universal tap affordance (§3: "scale 0.97 on press-in, spring
 * back; every tappable element — nothing is inert").
 *
 * An AnimatedPressable that scales to `PRESS_SCALE` on press-in (snappy spring,
 * a short fade under reduced motion) and springs back on release. Wrap any
 * otherwise-inert tappable (plain Pressable / TouchableOpacity) so it gains the
 * same press feel as Button / Chip / ItemSurface.
 *
 * Haptics default OFF (`haptic={null}`) — this component gives visual feedback
 * to surfaces that previously had none; it must NOT start buzzing sites that
 * deliberately ran silent. Sites that own a specific haptic keep firing it in
 * their own `onPress`; pass `haptic` only when THIS wrapper should own the tick.
 */
import { forwardRef } from 'react';
import * as Haptics from 'expo-haptics';
import { Pressable, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
} from 'react-native-reanimated';
import type {
  AccessibilityRole,
  Insets,
  PressableProps,
  View,
} from 'react-native';

import { PRESS_SCALE, animate, useReducedMotionSafe } from '@/lib/motion';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

const REST_SCALE = 1;

type HapticKind = 'light' | 'selection' | null;

interface PressProps
  extends Pick<PressableProps, 'onPress' | 'onLongPress'> {
  readonly children: React.ReactNode;
  readonly disabled?: boolean;
  /** Haptic to fire on press. Default `null` — no buzz unless asked. */
  readonly haptic?: HapticKind;
  readonly hitSlop?: number | Insets;
  readonly style?: StyleProp<ViewStyle>;
  readonly accessibilityRole?: AccessibilityRole;
  readonly accessibilityLabel?: string;
  readonly accessibilityHint?: string;
  readonly accessibilityState?: PressableProps['accessibilityState'];
}

function fireHaptic(kind: HapticKind) {
  if (kind === 'light') {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  } else if (kind === 'selection') {
    void Haptics.selectionAsync();
  }
}

export const Press = forwardRef<View, PressProps>(function Press(
  {
    children,
    onPress,
    onLongPress,
    disabled = false,
    haptic = null,
    hitSlop,
    style,
    accessibilityRole = 'button',
    accessibilityLabel,
    accessibilityHint,
    accessibilityState,
  },
  ref,
) {
  const reduced = useReducedMotionSafe();
  const scale = useSharedValue(REST_SCALE);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <AnimatedPressable
      ref={ref}
      accessibilityRole={accessibilityRole}
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled, ...accessibilityState }}
      disabled={disabled}
      hitSlop={hitSlop}
      onPressIn={() => {
        scale.value = animate(PRESS_SCALE, reduced, 'snappy');
      }}
      onPressOut={() => {
        scale.value = animate(REST_SCALE, reduced, 'snappy');
      }}
      onPress={(event) => {
        fireHaptic(haptic);
        onPress?.(event);
      }}
      onLongPress={onLongPress}
      style={[style, animatedStyle]}
    >
      {children}
    </AnimatedPressable>
  );
});
