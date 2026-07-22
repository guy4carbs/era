/**
 * QuizFlow — the quiz state machine.
 *
 * Drives the four phases: intro card -> twelve steps -> submitting -> reveal.
 * Single-select taps record the answer and auto-advance after the motion
 * settles; the occasions step toggles a set and advances on Continue. On the
 * last step the answers are sent to the server (authenticated); any failure
 * falls back to the local deterministic profile so the reveal always resolves.
 */
import { motion, spacing } from '@era/tokens';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { useCallback, useMemo, useRef, useState } from 'react';

import { strings } from '@era/core/strings';

import { Text } from '@/components/Text';
import { analytics } from '@/lib/analytics';
import { useTheme } from '@/lib/theme';

import { QuizIntro } from './QuizIntro';
import { QuizReveal } from './QuizReveal';
import { StepScreen } from './StepScreen';
import { deriveStyleProfile } from './deriveProfile';
import {
  QUIZ_STEPS,
  localProfile,
  normalizeProfile,
  type QuizAnswerMap,
  type RevealData,
} from './contract';

type Phase = 'intro' | 'step' | 'submitting' | 'reveal';

interface QuizFlowProps {
  /** Leave the quiz to the feed — used by skip and the reveal's step-in CTA. */
  readonly onExit: () => void;
  /**
   * Score with the pure client scorer only — skip the authenticated endpoint and
   * its spinner, resolving the reveal synchronously from `localProfile`. The one
   * honest seam the design lab needs so it can embed the REAL flow with no API
   * (the lab has no session); the shipping /quiz route leaves it unset and keeps
   * the server-derived profile with its offline fallback.
   */
  readonly localOnly?: boolean;
}

export function QuizFlow({ onExit, localOnly = false }: QuizFlowProps) {
  const { colors } = useTheme();
  const [phase, setPhase] = useState<Phase>('intro');
  const [stepIndex, setStepIndex] = useState(0);
  const [answers, setAnswers] = useState<QuizAnswerMap>({});
  const [reveal, setReveal] = useState<RevealData | null>(null);
  const advanceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const total = QUIZ_STEPS.length;
  const step = QUIZ_STEPS[stepIndex];

  const submit = useCallback(
    async (finalAnswers: QuizAnswerMap) => {
      // Funnel: the user answered every step and is submitting the quiz.
      analytics.track('quiz_completed');
      // Lab path: score locally and land straight on the reveal, no API, no spinner.
      if (localOnly) {
        setReveal(normalizeProfile(localProfile(finalAnswers)));
        setPhase('reveal');
        return;
      }
      setPhase('submitting');
      try {
        const { profile } = await deriveStyleProfile(finalAnswers);
        setReveal(normalizeProfile(profile));
      } catch {
        setReveal(normalizeProfile(localProfile(finalAnswers)));
      }
      setPhase('reveal');
    },
    [localOnly],
  );

  const advanceFrom = useCallback(
    (nextAnswers: QuizAnswerMap) => {
      if (stepIndex >= total - 1) {
        void submit(nextAnswers);
      } else {
        setStepIndex((i) => i + 1);
      }
    },
    [stepIndex, total, submit],
  );

  const handleSelect = useCallback(
    (optionId: string) => {
      if (!step) {
        return;
      }
      const nextAnswers: QuizAnswerMap = { ...answers, [step.id]: optionId };
      setAnswers(nextAnswers);
      // Let the accent ring land before moving on.
      if (advanceTimer.current) {
        clearTimeout(advanceTimer.current);
      }
      advanceTimer.current = setTimeout(() => advanceFrom(nextAnswers), motion.durations.minMs);
    },
    [step, answers, advanceFrom],
  );

  const handleToggle = useCallback(
    (optionId: string) => {
      if (!step) {
        return;
      }
      setAnswers((prev) => {
        const current = prev[step.id];
        const list = Array.isArray(current) ? current : [];
        const next = list.includes(optionId) ? list.filter((id) => id !== optionId) : [...list, optionId];
        return { ...prev, [step.id]: next };
      });
    },
    [step],
  );

  const handleContinue = useCallback(() => {
    advanceFrom(answers);
  }, [advanceFrom, answers]);

  const handleBack = useCallback(() => {
    if (advanceTimer.current) {
      clearTimeout(advanceTimer.current);
    }
    if (stepIndex === 0) {
      setPhase('intro');
    } else {
      setStepIndex((i) => i - 1);
    }
  }, [stepIndex]);

  const currentValue = useMemo(() => (step ? answers[step.id] : undefined), [step, answers]);

  if (phase === 'intro') {
    return (
      <QuizIntro
        onBegin={() => {
          // Funnel: the user started the style quiz.
          analytics.track('quiz_started');
          setPhase('step');
        }}
      />
    );
  }

  if (phase === 'submitting') {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.accent} />
        <Text variant="body" color={colors.secondaryStrong}>
          {strings.ovi.thinking}
        </Text>
      </View>
    );
  }

  if (phase === 'reveal' && reveal) {
    return <QuizReveal profile={reveal} onStepIn={onExit} />;
  }

  if (!step) {
    return null;
  }

  return (
    <StepScreen
      step={step}
      index={stepIndex}
      total={total}
      value={currentValue}
      onSelect={handleSelect}
      onToggle={handleToggle}
      onContinue={handleContinue}
      onBack={handleBack}
      onSkip={onExit}
      canGoBack
    />
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.s4,
  },
});
