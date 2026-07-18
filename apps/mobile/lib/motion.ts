/**
 * Era mobile — motion utilities.
 *
 * Bridges the `motion` design tokens to Reanimated and honours the OS
 * "Reduce Motion" setting. When reduced motion is on, springs collapse to a
 * short fade (`motion.durations.reducedFadeMs`) and looping/parallax effects
 * are suppressed by callers.
 */
import { motion } from '@era/tokens';
import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';
import {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
  type WithSpringConfig,
} from 'react-native-reanimated';

type SpringPreset = keyof typeof motion.springs;

/**
 * The universal press-in scale (§3: "scale 0.97 on press-in"). Single source —
 * every tappable reads this rather than a local literal.
 */
export const PRESS_SCALE = motion.press.scale;

/**
 * The one sanctioned easing curve, built from the `motion.easing.bezier` token
 * so every non-spring timing shares the same feel as the CSS bezier on web.
 * Any `withTiming` that is not an explicit reduced-motion fade must pass this.
 */
const [bx1, by1, bx2, by2] = motion.easing.bezier;
export const tokenEasing = Easing.bezier(bx1, by1, bx2, by2);

/** Reanimated spring config derived from a named motion token. */
export function springFromToken(preset: SpringPreset): WithSpringConfig {
  const { stiffness, damping } = motion.springs[preset];
  return { stiffness, damping };
}

/**
 * The sanctioned non-spring fade. Timing toward `toValue` on `tokenEasing`,
 * collapsing to the short `reducedFadeMs` under reduced motion. Use this instead
 * of a bare `withTiming` so no timing ever runs Reanimated's default easing.
 */
export function fadeTiming(toValue: number, reduced: boolean): number {
  return withTiming(toValue, {
    duration: reduced ? motion.durations.reducedFadeMs : motion.durations.maxMs,
    easing: tokenEasing,
  });
}

/**
 * Tracks the OS "Reduce Motion" accessibility flag, updating live when the
 * user toggles it. Callers use this to swap springs for fades and to disable
 * looping pulses / parallax.
 */
export function useReducedMotionSafe(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    let active = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((value) => {
      if (active) {
        setReduced(value);
      }
    });
    const subscription = AccessibilityInfo.addEventListener(
      'reduceMotionChanged',
      setReduced,
    );
    return () => {
      active = false;
      subscription.remove();
    };
  }, []);

  return reduced;
}

/**
 * Animate a shared value toward `toValue`. Reduced motion produces a short
 * timing fade; otherwise a spring from the named preset. Safe to call from JS
 * event handlers (`sharedValue.value = animate(...)`).
 */
export function animate(
  toValue: number,
  reduced: boolean,
  preset: SpringPreset = 'snappy',
): number {
  return reduced
    ? withTiming(toValue, { duration: motion.durations.reducedFadeMs })
    : withSpring(toValue, springFromToken(preset));
}

/**
 * Entrance choreography for a list/grid/chat item (§3, minus blur — RN has no
 * performant view blur). Returns an animated style that starts hidden
 * (`opacity 0`, translated down by `motion.stagger.riseYPx`) and, on mount,
 * fades in on `tokenEasing` while the rise settles on the gentle spring, delayed
 * by `index * motion.stagger.delayMs` so mapped children cascade. Under reduced
 * motion it is a simultaneous `reducedFadeMs` fade with no delay and no rise.
 *
 * Ergonomic for `FlatList` `renderItem` and `.map(...)` — spread the returned
 * style onto an `Animated.View`. Because the entrance fires once on mount, guard
 * first-appearance at the call site (a seen-set / mounted ref) so re-renders and
 * list updates do not replay it.
 */
export function useStaggerEntrance(index: number, reduced: boolean) {
  const opacity = useSharedValue(0);
  const translateY = useSharedValue(reduced ? 0 : motion.stagger.riseYPx);

  useEffect(() => {
    if (reduced) {
      opacity.value = withTiming(1, { duration: motion.durations.reducedFadeMs });
      return;
    }
    const delay = index * motion.stagger.delayMs;
    opacity.value = withDelay(
      delay,
      withTiming(1, { duration: motion.durations.minMs, easing: tokenEasing }),
    );
    translateY.value = withDelay(delay, withSpring(0, springFromToken('gentle')));
  }, [index, reduced, opacity, translateY]);

  return useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }],
  }));
}
