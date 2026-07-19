/**
 * PageHeader — a screen's title + one-line subtitle with D6 choreography.
 *
 * The title rises `motion.headerRise.yPx` (8px) with a fade; the subtitle
 * follows the same rise+fade on a `motion.headerRise.subtitleDelayMs` (60ms)
 * delay, so the header reads as a small two-beat entrance. The rise settles on
 * the gentle spring; the fade runs `tokenEasing`. Replays on tab focus (like
 * {@link ScreenEntrance}) so re-entering a tab replays the choreography.
 *
 * This is a LAYER on top of ScreenEntrance, not a replacement: a tab keeps
 * ScreenEntrance's whole-screen 6px rise, and the header adds its own +8px
 * relative rise with the delayed subtitle. The compound reads as the header
 * arriving a half-beat after the page — the 60ms subtitle delay is what makes
 * it a distinct layer rather than a double-rise fight.
 *
 * Under reduced motion (`useReducedMotionSafe`) both lines collapse to the
 * plain `fadeTiming` fade, simultaneous, with no rise and no delay.
 *
 * The subtitle sits at `body` size (17px) in `colors.secondary` — 17px is the
 * tier where `secondary` is AA-legal; below it the type system requires
 * `secondaryStrong`, so this must not shrink. `marginBottom` is the D6 rhythm's
 * `headerBelowPx` (32px), so the header owns the air down to its first section.
 */
import { layout, motion, spacing } from '@era/tokens';
import { useFocusEffect } from 'expo-router';
import { useCallback } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { Text } from '@/components/Text';
import { useTheme } from '@/lib/theme';
import {
  fadeTiming,
  springFromToken,
  tokenEasing,
  useReducedMotionSafe,
} from '@/lib/motion';

interface PageHeaderProps {
  readonly title: string;
  /** One calm line below the title. */
  readonly subtitle: string;
  /** Extra layout on the outer wrapper (the 32px marginBottom is built in). */
  readonly style?: StyleProp<ViewStyle>;
}

/**
 * Drive one line's opacity + translateY through the headerRise choreography,
 * replayed on focus. `delayMs` staggers the subtitle after the title; under
 * reduced motion both collapse to a simultaneous fade with no rise.
 */
function useLineEntrance(reduced: boolean, delayMs: number) {
  const opacity = useSharedValue(0);
  const translateY = useSharedValue(reduced ? 0 : motion.headerRise.yPx);

  useFocusEffect(
    useCallback(() => {
      if (reduced) {
        opacity.value = 0;
        opacity.value = fadeTiming(1, true);
        return;
      }
      opacity.value = 0;
      translateY.value = motion.headerRise.yPx;
      opacity.value = withDelay(
        delayMs,
        withTiming(1, { duration: motion.durations.minMs, easing: tokenEasing }),
      );
      translateY.value = withDelay(delayMs, withSpring(0, springFromToken('gentle')));
    }, [reduced, delayMs, opacity, translateY]),
  );

  return useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }],
  }));
}

export function PageHeader({ title, subtitle, style }: PageHeaderProps) {
  const { colors } = useTheme();
  const reduced = useReducedMotionSafe();

  const titleStyle = useLineEntrance(reduced, 0);
  const subtitleStyle = useLineEntrance(reduced, reduced ? 0 : motion.headerRise.subtitleDelayMs);

  return (
    <View style={[styles.container, style]}>
      <Animated.View style={titleStyle}>
        <Text accessibilityRole="header" variant="largeTitle" color={colors.text}>
          {title}
        </Text>
      </Animated.View>
      <Animated.View style={subtitleStyle}>
        <Text variant="body" color={colors.secondary}>
          {subtitle}
        </Text>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    // Tight title↔subtitle spacing — they read as one header block; the rhythm
    // token owns only the gap DOWN to the first section.
    gap: spacing.s2,
    marginBottom: layout.rhythm.headerBelowPx,
  },
});
