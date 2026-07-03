/**
 * Toast — a brief, self-dismissing status line pinned above the tab bar.
 *
 * Fades in when `message` is set and auto-clears after a short beat (the parent
 * owns the message state and clears it via `onHide`). Reduced motion collapses
 * the fade to an instant show/hide. Used for the "archived" confirmation.
 */
import { motion, radii, spacing, typeRamp } from '@era/tokens';
import { useEffect } from 'react';
import { StyleSheet, Text } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { useReducedMotionSafe } from '@/lib/motion';
import { useTheme } from '@/lib/theme';

const VISIBLE_MS = 2200;

interface ToastProps {
  readonly message: string | null;
  readonly onHide: () => void;
  /** Bottom offset (px) so the toast clears the tab bar + home indicator. */
  readonly bottom: number;
}

export function Toast({ message, onHide, bottom }: ToastProps) {
  const { colors } = useTheme();
  const reduced = useReducedMotionSafe();
  const opacity = useSharedValue(0);

  useEffect(() => {
    if (!message) return;
    const fade = (to: number) =>
      reduced ? withTiming(to, { duration: 0 }) : withTiming(to, { duration: motion.durations.reducedFadeMs });
    opacity.value = fade(1);
    const timer = setTimeout(() => {
      opacity.value = fade(0);
      onHide();
    }, VISIBLE_MS);
    return () => clearTimeout(timer);
  }, [message, reduced, opacity, onHide]);

  const style = useAnimatedStyle(() => ({ opacity: opacity.value }));

  if (!message) return null;

  return (
    <Animated.View
      accessibilityRole="alert"
      pointerEvents="none"
      style={[
        styles.toast,
        style,
        { bottom, backgroundColor: colors.text, borderColor: colors.hairline },
      ]}
    >
      <Text
        style={{
          color: colors.bg,
          fontSize: typeRamp.subhead.pt,
          lineHeight: typeRamp.subhead.lineHeight,
          textAlign: 'center',
        }}
      >
        {message}
      </Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  toast: {
    position: 'absolute',
    left: spacing.s4,
    right: spacing.s4,
    borderRadius: radii.input,
    borderWidth: StyleSheet.hairlineWidth,
    borderCurve: 'continuous',
    paddingVertical: spacing.s3,
    paddingHorizontal: spacing.s4,
  },
});
