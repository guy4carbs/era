/**
 * ScreenEntrance — the gentle page-transition wrapper for a tab screen.
 *
 * §3's pageRise: on tab FOCUS (and on first mount) the wrapped content replays a
 * soft entrance — opacity 0→1 with a small rise (`motion.pageRise.yPx`→0) on the
 * gentle spring. Under reduced motion it is a 150ms fade with no rise. Root-stack
 * pushes keep the native slide; this is only for the tab-switch cross-fade, so
 * wrap a tab screen's top-level content and leave the navigator's Stack alone.
 *
 * The wrapper fills its parent (`flex: 1`) and adds no layout of its own, so it
 * drops in around a screen's existing SafeAreaView / pager without reflow.
 */
import { motion } from '@era/tokens';
import { useFocusEffect } from 'expo-router';
import { useCallback, type PropsWithChildren } from 'react';
import { StyleSheet } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import {
  fadeTiming,
  springFromToken,
  tokenEasing,
  useReducedMotionSafe,
} from '@/lib/motion';

export function ScreenEntrance({ children }: PropsWithChildren) {
  const reduced = useReducedMotionSafe();
  const opacity = useSharedValue(0);
  const translateY = useSharedValue(reduced ? 0 : motion.pageRise.yPx);

  // Replays on every focus (tab switch) and on the first mount.
  useFocusEffect(
    useCallback(() => {
      if (reduced) {
        opacity.value = 0;
        opacity.value = fadeTiming(1, true);
        return;
      }
      opacity.value = 0;
      translateY.value = motion.pageRise.yPx;
      opacity.value = withTiming(1, {
        duration: motion.durations.minMs,
        easing: tokenEasing,
      });
      translateY.value = withSpring(0, springFromToken('gentle'));
    }, [reduced, opacity, translateY]),
  );

  const style = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }],
  }));

  return <Animated.View style={[styles.fill, style]}>{children}</Animated.View>;
}

const styles = StyleSheet.create({
  fill: {
    flex: 1,
  },
});
