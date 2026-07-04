/**
 * MoodCards — the final "era I'm entering" step (single-select).
 *
 * Each option maps to one of the six era moods; the card shows that mood's
 * title and tagline (from `strings.quiz.moods`, not the option label) on a hero
 * radius. A tap ticks a selection haptic and the flow moves to the reveal.
 */
import { radii, rnShadow, spacing, typeRamp } from '@era/tokens';
import * as Haptics from 'expo-haptics';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue } from 'react-native-reanimated';

import { strings, type QuizMoodId } from '@era/core/strings';

import { animate, useReducedMotionSafe } from '@/lib/motion';
import { useTheme } from '@/lib/theme';

import type { QuizOption, QuizStep } from './contract';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);
const PRESS_SCALE = 0.98;
const REST_SCALE = 1;

interface MoodCardsProps {
  readonly step: QuizStep;
  readonly selected: string | undefined;
  readonly onSelect: (optionId: string) => void;
}

export function MoodCards({ step, selected, onSelect }: MoodCardsProps) {
  return (
    <View style={styles.list}>
      {step.options.map((option) => (
        <MoodCard
          key={option.id}
          option={option}
          selected={option.id === selected}
          onSelect={onSelect}
        />
      ))}
    </View>
  );
}

interface MoodCardProps {
  readonly option: QuizOption;
  readonly selected: boolean;
  readonly onSelect: (optionId: string) => void;
}

function MoodCard({ option, selected, onSelect }: MoodCardProps) {
  const { colors } = useTheme();
  const reduced = useReducedMotionSafe();
  const scale = useSharedValue(REST_SCALE);
  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  const mood = strings.quiz.moods[option.id as QuizMoodId];
  const title = mood?.title ?? option.label;
  const tagline = mood?.tagline;

  return (
    <AnimatedPressable
      accessibilityRole="button"
      accessibilityLabel={tagline ? `${title}. ${tagline}` : title}
      accessibilityState={{ selected }}
      onPressIn={() => {
        scale.value = animate(PRESS_SCALE, reduced, 'snappy');
      }}
      onPressOut={() => {
        scale.value = animate(REST_SCALE, reduced, 'snappy');
      }}
      onPress={() => {
        void Haptics.selectionAsync();
        onSelect(option.id);
      }}
      style={[
        styles.card,
        selected ? rnShadow('e3') : rnShadow('e2'),
        {
          borderRadius: radii.hero,
          backgroundColor: colors.surface,
          borderColor: selected ? colors.accent : colors.hairline,
          borderWidth: selected ? 2 : StyleSheet.hairlineWidth,
        },
        animatedStyle,
      ]}
    >
      <Text style={{ color: colors.text, fontSize: typeRamp.title3.pt, lineHeight: typeRamp.title3.lineHeight, fontWeight: '600' }}>
        {title}
      </Text>
      {tagline ? (
        <Text style={{ color: colors.secondaryStrong, fontSize: typeRamp.subhead.pt, lineHeight: typeRamp.subhead.lineHeight }}>
          {tagline}
        </Text>
      ) : null}
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  list: {
    gap: spacing.s4,
  },
  card: {
    padding: spacing.s6,
    gap: spacing.s2,
    borderCurve: 'continuous',
  },
});
