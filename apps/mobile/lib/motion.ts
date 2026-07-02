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
  withSpring,
  withTiming,
  type WithSpringConfig,
} from 'react-native-reanimated';

type SpringPreset = keyof typeof motion.springs;

/** Reanimated spring config derived from a named motion token. */
export function springFromToken(preset: SpringPreset): WithSpringConfig {
  const { stiffness, damping } = motion.springs[preset];
  return { stiffness, damping };
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
