/**
 * ProgressDots — the quiz's step indicator.
 *
 * One dot per step; the current dot fills with accent and widens. The whole row
 * carries a single accessibility label ("Step N of M") so a screen reader
 * announces progress without reading twelve separate dots. The active dot
 * animates its width/opacity with a gentle spring (a short fade under reduced
 * motion).
 */
import { spacing } from '@era/tokens';
import { StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import { useEffect } from 'react';

import { strings } from '@era/core/strings';

import { animate, useReducedMotionSafe } from '@/lib/motion';
import { useTheme } from '@/lib/theme';

const DOT_SIZE = spacing.s1 + spacing.s1; // 8pt resting dot
const ACTIVE_WIDTH = spacing.s6; // active dot stretches to a pill

interface ProgressDotsProps {
  readonly total: number;
  readonly current: number;
}

export function ProgressDots({ total, current }: ProgressDotsProps) {
  const { colors } = useTheme();

  return (
    <View
      accessibilityRole="progressbar"
      accessibilityLabel={strings.quiz.progressLabel(current + 1, total)}
      style={styles.row}
    >
      {Array.from({ length: total }, (_, index) => (
        <Dot
          key={index}
          active={index === current}
          done={index < current}
          activeColor={colors.accent}
          idleColor={colors.hairline}
        />
      ))}
    </View>
  );
}

interface DotProps {
  readonly active: boolean;
  readonly done: boolean;
  readonly activeColor: string;
  readonly idleColor: string;
}

function Dot({ active, done, activeColor, idleColor }: DotProps) {
  const reduced = useReducedMotionSafe();
  const width = useSharedValue(active ? ACTIVE_WIDTH : DOT_SIZE);
  const fill = useSharedValue(active || done ? 1 : 0);

  useEffect(() => {
    width.value = animate(active ? ACTIVE_WIDTH : DOT_SIZE, reduced, 'gentle');
    fill.value = animate(active || done ? 1 : 0, reduced, 'gentle');
  }, [active, done, reduced, width, fill]);

  const animatedStyle = useAnimatedStyle(() => ({
    width: width.value,
    opacity: 0.4 + fill.value * 0.6,
  }));

  return (
    <Animated.View
      style={[
        styles.dot,
        { height: DOT_SIZE, borderRadius: DOT_SIZE / 2, backgroundColor: active || done ? activeColor : idleColor },
        animatedStyle,
      ]}
    />
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s1,
  },
  dot: {
    borderCurve: 'continuous',
  },
});
