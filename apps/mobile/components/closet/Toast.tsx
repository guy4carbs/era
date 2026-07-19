/**
 * Toast — a brief, self-dismissing status line pinned above the tab bar.
 *
 * A BUSY glass pill (GlassPanel): it floats above the tab bar, potentially over
 * feed/closet imagery, so the AA scrim tint guarantees the label stays legible.
 * On busy glass the tint IS the surface colour, so the label renders in
 * `colors.text` — exactly the text-on-glass pair the contrast audit certifies
 * (previously an opaque inverted pill, `colors.text` bg / `colors.bg` text).
 *
 * Fades in when `message` is set and auto-clears after a short beat (the parent
 * owns the message state and clears it via `onHide`). Reduced motion collapses
 * the fade to an instant show/hide. Used for the "archived" confirmation.
 */
import { motion, radii, spacing } from '@era/tokens';
import { useEffect } from 'react';
import { StyleSheet } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { GlassPanel } from '@/components/GlassPanel';
import { Text } from '@/components/Text';
import { tokenEasing, useReducedMotionSafe } from '@/lib/motion';
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
      reduced ? withTiming(to, { duration: 0 }) : withTiming(to, { duration: motion.durations.reducedFadeMs, easing: tokenEasing });
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
      style={[styles.toast, style, { bottom }]}
    >
      {/* busy glass: AA scrim over imagery; e3 lifts the pill off the content. */}
      <GlassPanel busy radius={radii.input} shadow="e3" style={styles.pill}>
        <Text variant="caption" size="subhead" color={colors.text} style={styles.label}>
          {message}
        </Text>
      </GlassPanel>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  toast: {
    position: 'absolute',
    left: spacing.s4,
    right: spacing.s4,
  },
  pill: {
    paddingVertical: spacing.s3,
    paddingHorizontal: spacing.s4,
  },
  label: { textAlign: 'center' },
});
