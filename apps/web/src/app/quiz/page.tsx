'use client';

import { useEffect, useState, type CSSProperties } from 'react';
import { useRouter } from 'next/navigation';
import { typeRamp } from '@era/tokens';
import { strings } from '@era/core/strings';
import { type QuizAnswers } from '@era/core/quiz';
import { Button, Card } from '../../components';
import { QuizFlow, Reveal } from '../../components/quiz';
import { useSession } from '../../lib/auth-client';
import { track } from '../../lib/analytics';
import { Text } from '../../components/Text';

type Phase = 'intro' | 'quiz' | 'reveal';

const mainStyle: CSSProperties = {
  minHeight: '100dvh',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  paddingInline: 'var(--space-4)',
  paddingBlock: 'var(--space-8)',
};

const columnStyle: CSSProperties = {
  width: '100%',
  maxWidth: 'var(--feed-col)',
};

const introInner: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: 'var(--space-4)',
  textAlign: 'center',
  padding: 'var(--space-8)',
};

const skipLinkStyle: CSSProperties = {
  background: 'transparent',
  border: 'none',
  cursor: 'pointer',
  color: 'var(--color-secondary-strong)',
  fontSize: typeRamp.footnote.rem,
  lineHeight: `${typeRamp.footnote.lineHeight}px`,
  fontWeight: 600,
  minHeight: 'var(--touch-target-min)',
  paddingInline: 'var(--space-2)',
};

/**
 * The full-screen style quiz: intro → twelve steps → reveal, on its own chrome
 * (no tab bar). Signed-out visitors are bounced to sign-in, since the reveal
 * writes a profile against the session. The intro sets expectations; QuizFlow
 * collects the answers; Reveal derives and shows the starter era.
 */
export default function QuizPage() {
  const router = useRouter();
  const { data: session, isPending } = useSession();
  const [phase, setPhase] = useState<Phase>('intro');
  const [answers, setAnswers] = useState<QuizAnswers | null>(null);

  // The quiz is a signed-in surface; send everyone else to sign-in.
  useEffect(() => {
    if (isPending) return;
    if (!session) router.replace('/sign-in');
  }, [isPending, session, router]);

  const goToFeed = () => router.push('/feed');

  if (isPending || !session) {
    return (
      <main style={mainStyle}>
        <Text variant="body" as="span" style={{ color: 'var(--color-secondary-strong)' }}>{strings.ovi.thinking}</Text>
      </main>
    );
  }

  return (
    <main style={mainStyle}>
      <div style={columnStyle}>
        {phase === 'intro' ? (
          <Card>
            <div style={introInner}>
              <Text variant="largeTitle" as="h1" style={{ margin: 0, color: 'var(--color-text)' }}>{strings.quiz.introTitle}</Text>
              <Text variant="body" as="p" style={{ margin: 0, color: 'var(--color-secondary-strong)' }}>{strings.quiz.introBody}</Text>
              <Button
                onClick={() => {
                  // The quiz begins here — the first step renders next.
                  track('quiz_started');
                  setPhase('quiz');
                }}
              >
                {strings.common.continue}
              </Button>
              <button type="button" style={skipLinkStyle} onClick={goToFeed}>
                {strings.quiz.skip}
              </button>
            </div>
          </Card>
        ) : null}

        {phase === 'quiz' ? (
          <QuizFlow
            onComplete={(collected) => {
              // Last step answered — the reveal derives the starter era next.
              track('quiz_completed');
              setAnswers(collected);
              setPhase('reveal');
            }}
            onSkip={goToFeed}
          />
        ) : null}

        {phase === 'reveal' && answers ? <Reveal answers={answers} /> : null}
      </div>
    </main>
  );
}
