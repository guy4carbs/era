'use client';

import { useEffect, useState, type CSSProperties } from 'react';
import { useRouter } from 'next/navigation';
import { motion, useReducedMotion } from 'motion/react';
import { motion as motionToken, typeRamp, glow } from '@era/tokens';
import { strings } from '@era/core/strings';
import {
  ARCHETYPES,
  deterministicProfile,
  type QuizAnswers,
  type StyleProfileResult,
} from '@era/core/quiz';
import { transitionFor } from '../../lib/motion';
import { useTheme } from '../../lib/theme';
import { Button, Text } from '../../components';

export interface RevealProps {
  answers: QuizAnswers;
}

const centerColumn: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: 'var(--space-4)',
  textAlign: 'center',
};

const eyebrowStyle: CSSProperties = {
  fontSize: typeRamp.subhead.rem,
  lineHeight: `${typeRamp.subhead.lineHeight}px`,
  fontWeight: 600,
  color: 'var(--color-secondary-strong)',
};

const nameStyle: CSSProperties = {
  position: 'relative',
  isolation: 'isolate',
  margin: 0,
  color: 'var(--color-text)',
};

const keywordStyle: CSSProperties = {
  fontSize: typeRamp.body.rem,
  lineHeight: `${typeRamp.body.lineHeight}px`,
  color: 'var(--color-secondary-strong)',
};

const eraCardStyle: CSSProperties = {
  width: '100%',
  padding: 'var(--space-6)',
  borderRadius: 'var(--radius-hero)',
  background: 'var(--color-surface)',
  boxShadow: 'var(--shadow-e2)',
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-3)',
  textAlign: 'start',
};

const eraTitleStyle: CSSProperties = {
  margin: 0,
  color: 'var(--color-text)',
};

const eraDescStyle: CSSProperties = {
  margin: 0,
  fontSize: typeRamp.body.rem,
  lineHeight: `${typeRamp.body.lineHeight}px`,
  color: 'var(--color-secondary-strong)',
};

/** Per-swatch entrance stagger, keyed to the token fade duration. */
const STAGGER = motionToken.durations.reducedFadeMs / 1000;

/**
 * The reveal. Sends the answers to the derivation endpoint and renders the
 * returned profile; if the request fails for any reason it falls back to the
 * client-safe deterministic profile so the user always lands on an era. The
 * archetype name glows, the palette staggers in, and the era title carries the
 * editorial serif — all collapsing to a plain fade under reduced motion.
 */
export function Reveal({ answers }: RevealProps) {
  const router = useRouter();
  const reduced = useReducedMotion();
  const { resolved } = useTheme();
  const [profile, setProfile] = useState<StyleProfileResult | null>(null);

  useEffect(() => {
    let active = true;
    void (async () => {
      let result: StyleProfileResult;
      try {
        const res = await fetch('/api/derive-style-profile', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ answers }),
        });
        if (res.ok) {
          const body = (await res.json()) as { profile: StyleProfileResult };
          result = body.profile;
        } else {
          // Any non-OK (including a 429 daily AI limit) degrades gracefully to the
          // client-safe deterministic era, so the user always lands on a reveal
          // rather than an error — the limit is felt as "less magic", not a wall.
          result = deterministicProfile(answers);
        }
      } catch {
        result = deterministicProfile(answers);
      }
      if (active) setProfile(result);
    })();
    return () => {
      active = false;
    };
  }, [answers]);

  if (!profile) {
    return (
      <div style={{ ...centerColumn, paddingBlock: 'var(--space-16)' }} aria-live="polite">
        <Text variant="body" as="span" style={keywordStyle}>
          {strings.ovi.thinking}
        </Text>
      </div>
    );
  }

  const archetypeName = ARCHETYPES[profile.archetype]?.name ?? profile.archetype;
  const glowPercent = Math.round(glow.opacity[resolved] * 100);
  const bloom = `radial-gradient(circle, color-mix(in srgb, var(--color-accent) ${glowPercent}%, transparent), transparent 70%)`;

  const swatchContainer = {
    hidden: {},
    visible: { transition: { staggerChildren: reduced ? 0 : STAGGER } },
  };
  const swatchItem = {
    hidden: { opacity: 0, scale: reduced ? 1 : 0.8 },
    visible: { opacity: 1, scale: 1 },
  };

  return (
    <motion.div
      style={centerColumn}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={transitionFor(motionToken.springs.gentle, reduced)}
    >
      <Text variant="ui" as="span" style={eyebrowStyle}>
        {strings.quiz.revealTitle}
      </Text>

      <Text variant="largeTitle" as="h1" weight={700} style={nameStyle}>
        <span
          aria-hidden="true"
          style={{
            position: 'absolute',
            inset: '-40%',
            background: bloom,
            filter: 'blur(var(--glow-blur))',
            pointerEvents: 'none',
            zIndex: -1,
          }}
        />
        {archetypeName}
      </Text>

      {profile.keywords.length > 0 ? (
        <Text variant="body" as="span" style={keywordStyle}>
          {profile.keywords.join(' · ')}
        </Text>
      ) : null}

      <motion.div
        variants={swatchContainer}
        initial="hidden"
        animate="visible"
        style={{ display: 'flex', gap: 'var(--space-2)', justifyContent: 'center', flexWrap: 'wrap' }}
        aria-hidden="true"
      >
        {profile.palette.map((hex, i) => (
          <motion.span
            key={`${hex}-${i}`}
            variants={swatchItem}
            transition={transitionFor(motionToken.springs.gentle, reduced)}
            style={{
              width: 'var(--space-8)',
              height: 'var(--space-8)',
              borderRadius: 'var(--radius-chip)',
              background: hex,
              boxShadow: 'var(--shadow-e1)',
            }}
          />
        ))}
      </motion.div>

      <div style={eraCardStyle}>
        <Text variant="title" as="h2" size="title1" style={eraTitleStyle}>
          {profile.era_suggestion.title}
        </Text>
        <Text variant="body" as="p" style={eraDescStyle}>
          {profile.era_suggestion.description}
        </Text>
      </div>

      <Text variant="caption" as="span" size="footnote" style={keywordStyle}>
        {strings.quiz.revealSubtitle}
      </Text>

      <Button onClick={() => router.push('/feed')}>{strings.quiz.revealCta}</Button>
    </motion.div>
  );
}
