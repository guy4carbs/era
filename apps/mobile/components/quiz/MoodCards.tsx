/**
 * MoodCards — the final "era I'm entering" step (single-select).
 *
 * Each option maps to one of the six era moods; the card shows that mood's
 * title (in the baked Fraunces `title` face — these are editorial mood names,
 * not chrome) and tagline (from `strings.quiz.moods`, not the option label) on a
 * hero radius. Selection blooms the shared accent glow and settles into the 2px
 * border. A tap ticks a selection haptic and the flow moves to the reveal.
 */
import { radii, rnShadow, spacing } from '@era/tokens';
import * as Haptics from 'expo-haptics';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue } from 'react-native-reanimated';

import { strings, type QuizMoodId } from '@era/core/strings';

import { Text } from '@/components/Text';
import { PRESS_SCALE, animate, useReducedMotionSafe } from '@/lib/motion';
import { useTheme } from '@/lib/theme';

import { SelectionGlow } from './SelectionGlow';
import type { QuizOption, QuizStep } from './contract';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);
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
  const { colors, resolved } = useTheme();
  const reduced = useReducedMotionSafe();
  const scale = useSharedValue(REST_SCALE);
  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  const mood = strings.quiz.moods[option.id as QuizMoodId];
  const title = mood?.title ?? option.label;
  const tagline = mood?.tagline;

  return (
    <View style={styles.cell}>
      {/* The shared select-time bloom sits behind the hero card. */}
      <SelectionGlow selected={selected} radius={radii.hero} />
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
          selected ? rnShadow('e3', resolved) : rnShadow('e2', resolved),
          {
            borderRadius: radii.hero,
            backgroundColor: colors.surface,
            borderColor: selected ? colors.accent : colors.hairline,
            borderWidth: selected ? 2 : StyleSheet.hairlineWidth,
          },
          animatedStyle,
        ]}
      >
        {/* The mood name in the baked Fraunces `title` face — editorial, not chrome. */}
        <Text variant="title" size="title3" color={colors.text}>
          {title}
        </Text>
        {tagline ? (
          <Text variant="body" size="subhead" color={colors.secondaryStrong}>
            {tagline}
          </Text>
        ) : null}
      </AnimatedPressable>
    </View>
  );
}

const styles = StyleSheet.create({
  list: {
    gap: spacing.s4,
  },
  // A positioned wrapper so the bloom can sit behind the card.
  cell: {
    position: 'relative',
  },
  card: {
    padding: spacing.s6,
    gap: spacing.s2,
    borderCurve: 'continuous',
  },
});
