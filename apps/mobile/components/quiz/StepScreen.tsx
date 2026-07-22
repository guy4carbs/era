/**
 * StepScreen — the chrome and renderer host for a single quiz step.
 *
 * Lays out the header (back chevron | the warm {@link ProgressLine} | skip), the
 * step's title and prompt, and the option renderer chosen by {@link rendererFor}.
 * Single-select steps advance on tap; the multi-select occasions step shows a
 * Continue button. Content slides in horizontally with a fluid spring; under
 * reduced motion it cross-fades with no translation.
 *
 * The step title and prompt are the quiz's editorial voice — the title renders
 * in the baked Fraunces `title` face (D-QUIZ), the prompt in body sans beneath.
 */
import { radii, spacing } from '@era/tokens';
import { ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import { useEffect } from 'react';

import { strings } from '@era/core/strings';

import { Button } from '@/components/Button';
import { Press } from '@/components/Press';
import { Text } from '@/components/Text';
import { animate, useReducedMotionSafe } from '@/lib/motion';
import { useTheme } from '@/lib/theme';

import { MoodCards } from './MoodCards';
import { OccasionChips } from './OccasionChips';
import { PaletteBoards } from './PaletteBoards';
import { PhotoOptionGrid } from './PhotoOptionGrid';
import { ProgressLine } from './ProgressLine';
import { TextBands } from './TextBands';
import { isMultiStep, rendererFor, type QuizAnswerValue, type QuizStep } from './contract';

interface StepScreenProps {
  readonly step: QuizStep;
  readonly index: number;
  readonly total: number;
  readonly value: QuizAnswerValue | undefined;
  readonly onSelect: (optionId: string) => void;
  readonly onToggle: (optionId: string) => void;
  readonly onContinue: () => void;
  readonly onBack: () => void;
  readonly onSkip: () => void;
  readonly canGoBack: boolean;
}

export function StepScreen({
  step,
  index,
  total,
  value,
  onSelect,
  onToggle,
  onContinue,
  onBack,
  onSkip,
  canGoBack,
}: StepScreenProps) {
  const { colors } = useTheme();
  const reduced = useReducedMotionSafe();
  const { width } = useWindowDimensions();

  // Slide the content in from the right on each step change (fade if reduced).
  const translateX = useSharedValue(0);
  const opacity = useSharedValue(1);
  useEffect(() => {
    translateX.value = reduced ? 0 : width * 0.25;
    opacity.value = 0;
    translateX.value = animate(0, reduced, 'fluid');
    opacity.value = animate(1, reduced, 'gentle');
  }, [index, reduced, width, translateX, opacity]);

  const contentStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
    opacity: opacity.value,
  }));

  const single = typeof value === 'string' ? value : undefined;
  const multi = Array.isArray(value) ? value : [];
  const renderer = rendererFor(step);

  return (
    <View style={styles.container}>
      {/* Header: back | the warm progress line (fills the row) | skip. The line
          replaces the retired dots, so progress lives inline in the chrome. */}
      <View style={styles.header}>
        <Press
          accessibilityRole="button"
          accessibilityLabel="Back"
          accessibilityState={{ disabled: !canGoBack }}
          disabled={!canGoBack}
          hitSlop={spacing.s3}
          onPress={onBack}
          style={styles.backButton}
        >
          <Text variant="ui" size="title2" weight={400} color={canGoBack ? colors.text : 'transparent'}>
            ‹
          </Text>
        </Press>
        <View style={styles.progress}>
          <ProgressLine total={total} current={index} />
        </View>
        <Press
          accessibilityRole="button"
          accessibilityLabel={strings.quiz.skip}
          hitSlop={spacing.s3}
          onPress={onSkip}
          style={styles.skipButton}
        >
          <Text variant="ui" weight={400} color={colors.secondaryStrong}>
            {strings.quiz.skip}
          </Text>
        </Press>
      </View>

      <Animated.View style={[styles.body, contentStyle]}>
        <ScrollView
          contentContainerStyle={styles.scroll}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.prompt}>
            {/* The step title is the quiz's editorial voice — baked Fraunces `title`. */}
            <Text accessibilityRole="header" variant="title" color={colors.text}>
              {step.title}
            </Text>
            <Text variant="body" color={colors.secondaryStrong}>
              {step.prompt}
            </Text>
          </View>

          {renderer === 'photo' ? <PhotoOptionGrid step={step} selected={single} onSelect={onSelect} /> : null}
          {renderer === 'palette' ? <PaletteBoards step={step} selected={single} onSelect={onSelect} /> : null}
          {renderer === 'budget' ? <TextBands step={step} selected={single} onSelect={onSelect} /> : null}
          {renderer === 'mood' ? <MoodCards step={step} selected={single} onSelect={onSelect} /> : null}
          {renderer === 'occasions' ? <OccasionChips step={step} selected={multi} onToggle={onToggle} /> : null}
        </ScrollView>

        {isMultiStep(step) ? (
          <View style={styles.footer}>
            <Button
              label={strings.common.continue}
              onPress={onContinue}
              disabled={multi.length === 0}
              haptic
            />
          </View>
        ) : null}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.s4,
    gap: spacing.s4,
    height: spacing.s12,
  },
  backButton: {
    minWidth: spacing.s8,
    justifyContent: 'center',
  },
  // The line takes the middle of the header row, breathing between back and skip.
  progress: {
    flex: 1,
    justifyContent: 'center',
  },
  skipButton: {
    borderRadius: radii.chip,
    justifyContent: 'center',
  },
  body: {
    flex: 1,
  },
  scroll: {
    paddingHorizontal: spacing.s6,
    paddingBottom: spacing.s8,
    gap: spacing.s6,
  },
  prompt: {
    gap: spacing.s2,
    marginBottom: spacing.s2,
  },
  footer: {
    paddingHorizontal: spacing.s6,
    paddingTop: spacing.s3,
    paddingBottom: spacing.s4,
  },
});
