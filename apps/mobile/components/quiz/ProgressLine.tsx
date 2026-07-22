/**
 * ProgressLine — the quiz's step indicator (D-QUIZ): a thin warm line, no
 * numbers, no dots.
 *
 * A hairline-colored track at the frozen `layout.quizProgress.heightPx` (2px)
 * carries an accent fill that grows to the completed fraction — (current+1)/total
 * — on the gentle spring. The container keeps the single `progressLabel`
 * accessibility label so a screen reader announces "Step N of M" without reading
 * chrome. Under reduced motion the fill jumps to width with a short fade.
 */
import { layout, radii } from '@era/tokens';
import { StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import { useEffect } from 'react';

import { strings } from '@era/core/strings';

import { animate, useReducedMotionSafe } from '@/lib/motion';
import { useTheme } from '@/lib/theme';

interface ProgressLineProps {
  readonly total: number;
  readonly current: number;
}

export function ProgressLine({ total, current }: ProgressLineProps) {
  const { colors } = useTheme();
  const reduced = useReducedMotionSafe();

  // The fill reads the fraction COMPLETED including the current step, so step 1
  // of 12 already shows forward motion rather than an empty rail.
  const fraction = total > 0 ? Math.min(1, (current + 1) / total) : 0;
  const progress = useSharedValue(fraction);

  useEffect(() => {
    progress.value = animate(fraction, reduced, 'gentle');
  }, [fraction, reduced, progress]);

  const fillStyle = useAnimatedStyle(() => ({
    width: `${progress.value * 100}%`,
  }));

  return (
    <View
      accessibilityRole="progressbar"
      accessibilityLabel={strings.quiz.progressLabel(current + 1, total)}
      style={[styles.track, { backgroundColor: colors.hairline }]}
    >
      <Animated.View style={[styles.fill, { backgroundColor: colors.accent }, fillStyle]} />
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    height: layout.quizProgress.heightPx, // 2px — the frozen token, editorial not chrome
    borderRadius: radii.full,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: radii.full,
  },
});
