'use client';

import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { motion as motionToken, spacing } from '@era/tokens';
import { strings } from '@era/core/strings';
import { QUIZ_STEPS, type QuizAnswers } from '@era/core/quiz';
import { transitionFor } from '../../lib/motion';
import { Button, Text, TextControlBoundary } from '../../components';
import { ProgressDots } from './ProgressDots';
import { PhotoOptionGrid } from './steps/PhotoOptionGrid';
import { PaletteBoards } from './steps/PaletteBoards';
import { OccasionChips } from './steps/OccasionChips';
import { TextBands } from './steps/TextBands';
import { MoodCards } from './steps/MoodCards';

export interface QuizFlowProps {
  /** Fires once the last step is answered, with the assembled answers. */
  onComplete: (answers: QuizAnswers) => void;
  /** Fires when the user skips out of the quiz. */
  onSkip: () => void;
}

type AnswerMap = Record<string, string | string[]>;

const TOTAL = QUIZ_STEPS.length;

const headerStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '1fr auto 1fr',
  alignItems: 'center',
  gap: 'var(--space-3)',
};

const iconButtonStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  minWidth: 'var(--touch-target-min)',
  minHeight: 'var(--touch-target-min)',
  background: 'transparent',
  border: 'none',
  cursor: 'pointer',
  color: 'var(--color-text)',
  justifySelf: 'start',
};

const skipStyle: CSSProperties = {
  justifySelf: 'end',
  background: 'transparent',
  border: 'none',
  cursor: 'pointer',
  color: 'var(--color-secondary-strong)',
  minHeight: 'var(--touch-target-min)',
  paddingInline: 'var(--space-2)',
};

const titleStyle: CSSProperties = {
  margin: 0,
  color: 'var(--color-text)',
};

const promptStyle: CSSProperties = {
  margin: 0,
  color: 'var(--color-secondary-strong)',
};

/** Left-pointing chevron for the back control. */
function BackChevron() {
  return (
    <svg width={spacing.s6} height={spacing.s6} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M15 18l-6-6 6-6"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * The twelve-step quiz engine. Holds the answer map and the current index,
 * auto-advancing single-select steps one motion-token beat after a tap and
 * gating the multi-select step behind Continue. Steps slide horizontally with
 * the fluid spring (a plain fade under reduced motion); back preserves answers.
 */
export function QuizFlow({ onComplete, onSkip }: QuizFlowProps) {
  const reduced = useReducedMotion();
  const [index, setIndex] = useState(0);
  const [direction, setDirection] = useState(1);
  const [answers, setAnswers] = useState<AnswerMap>({});
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimer = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  useEffect(() => clearTimer, []);

  // `index` is always kept in range, so this guard only satisfies the checker.
  const step = QUIZ_STEPS[index];
  if (!step) return null;

  const isMulti = step.kind === 'multi';
  const value = answers[step.id];

  const goForward = (from: number, nextAnswers: AnswerMap) => {
    if (from >= TOTAL - 1) {
      onComplete({ v: 1, steps: nextAnswers });
      return;
    }
    setDirection(1);
    setIndex(from + 1);
  };

  const handleSingleSelect = (optionId: string) => {
    const next: AnswerMap = { ...answers, [step.id]: optionId };
    const from = index;
    setAnswers(next);
    clearTimer();
    // Auto-advance one motion beat later so the selected state registers first.
    timerRef.current = setTimeout(
      () => goForward(from, next),
      motionToken.durations.minMs,
    );
  };

  const handleToggle = (optionId: string) => {
    setAnswers((prev) => {
      const current = Array.isArray(prev[step.id]) ? (prev[step.id] as string[]) : [];
      const nextArr = current.includes(optionId)
        ? current.filter((id) => id !== optionId)
        : [...current, optionId];
      return { ...prev, [step.id]: nextArr };
    });
  };

  const handleContinue = () => {
    clearTimer();
    goForward(index, answers);
  };

  const handleBack = () => {
    clearTimer();
    if (index > 0) {
      setDirection(-1);
      setIndex((i) => i - 1);
    }
  };

  const handleSkip = () => {
    clearTimer();
    onSkip();
  };

  const selectedId = typeof value === 'string' ? value : undefined;
  const selectedIds = Array.isArray(value) ? value : [];
  const offset = reduced ? 0 : spacing.s8;

  const renderStep = () => {
    switch (step.id) {
      case 'palette':
        return <PaletteBoards step={step} selectedId={selectedId} onSelect={handleSingleSelect} />;
      case 'occasions':
        return <OccasionChips step={step} selectedIds={selectedIds} onToggle={handleToggle} />;
      case 'budget':
        return <TextBands step={step} selectedId={selectedId} onSelect={handleSingleSelect} />;
      case 'era':
        return <MoodCards step={step} selectedId={selectedId} onSelect={handleSingleSelect} />;
      default:
        return <PhotoOptionGrid step={step} selectedId={selectedId} onSelect={handleSingleSelect} />;
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
      <div style={headerStyle}>
        {index > 0 ? (
          <button type="button" aria-label="Back" onClick={handleBack} style={iconButtonStyle}>
            <BackChevron />
          </button>
        ) : (
          <span />
        )}
        <ProgressDots current={index} total={TOTAL} />
        <TextControlBoundary>
          <button type="button" onClick={handleSkip} style={skipStyle}>
            <Text variant="ui" size="footnote" weight={600}>
              {strings.quiz.skip}
            </Text>
          </button>
        </TextControlBoundary>
      </div>

      <AnimatePresence mode="wait" custom={direction} initial={false}>
        <motion.div
          key={step.id}
          custom={direction}
          variants={{
            enter: (dir: number) => ({ x: dir * offset, opacity: 0 }),
            center: { x: 0, opacity: 1 },
            exit: (dir: number) => ({ x: dir * -offset, opacity: 0 }),
          }}
          initial="enter"
          animate="center"
          exit="exit"
          transition={transitionFor(motionToken.springs.fluid, reduced)}
          style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
            <Text variant="title" as="h2" size="title2" weight={600} style={titleStyle}>
              {step.title}
            </Text>
            <Text variant="body" as="p" style={promptStyle}>
              {step.prompt}
            </Text>
          </div>

          {renderStep()}

          {isMulti ? (
            <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 'var(--space-2)' }}>
              <Button onClick={handleContinue} disabled={selectedIds.length === 0}>
                {strings.common.continue}
              </Button>
            </div>
          ) : null}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
