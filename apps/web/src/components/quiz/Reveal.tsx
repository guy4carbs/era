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
import { transitionFor, viewTransition } from '../../lib/motion';
import { useTheme } from '../../lib/theme';
import { Button, Text } from '../../components';

export interface RevealProps {
  answers: QuizAnswers;
  /**
   * A pre-computed profile to render directly, bypassing the derivation fetch.
   * The design lab passes `deterministicProfile(answers)` here so the embedded
   * reveal is pure and hits no API (and never needs a session). Production omits
   * it, so the real fetch-with-fallback path runs untouched.
   */
  profileOverride?: StyleProfileResult;
  /**
   * When true the CTA renders but does not navigate — the design lab embeds the
   * real reveal as a living specimen where "Step in" must not leave the page.
   */
  inertCta?: boolean;
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

// The reveal choreography (D-QUIZ), deliberately ONE NOTCH BELOW the daily
// ritual (motion.reveal). All beats come from motion.quizReveal and fit its
// maxTotalMs budget (1800ms). Seconds, since Framer transitions take seconds:
//   - name blooms FIRST at t=0 (gentle spring, bloomScale → 1 + fade + glow)
//   - palette swatches cascade one swatchStaggerMs beat apart
//   - the era card settles LAST, entering at eraSettleDelayMs
// Worst case: 8 swatches × 45ms = 360ms of cascade, then the era card starts at
// 900ms and settles on the gentle spring (~<900ms tail) → comfortably < 1800ms.
const SWATCH_STAGGER_S = motionToken.quizReveal.swatchStaggerMs / 1000;
const ERA_SETTLE_S = motionToken.quizReveal.eraSettleDelayMs / 1000;

/**
 * The reveal. Sends the answers to the derivation endpoint and renders the
 * returned profile; if the request fails for any reason it falls back to the
 * client-safe deterministic profile so the user always lands on an era. The
 * archetype name glows, the palette staggers in, and the era title carries the
 * editorial serif — all collapsing to a plain fade under reduced motion.
 */
export function Reveal({ answers, profileOverride, inertCta = false }: RevealProps) {
  const router = useRouter();
  const reduced = useReducedMotion();
  const { resolved } = useTheme();
  const [profile, setProfile] = useState<StyleProfileResult | null>(profileOverride ?? null);

  useEffect(() => {
    // The lab supplies the profile directly (pure, no API) — skip the fetch.
    if (profileOverride) {
      setProfile(profileOverride);
      return;
    }
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
  }, [answers, profileOverride]);

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

  // The name bloom: scale up from bloomScale to 1 with a fade, on the gentle
  // spring — the FIRST beat. Under reduced motion it appears at once, plain fade.
  const nameEnter = {
    initial: reduced
      ? { opacity: 0 }
      : { opacity: 0, scale: motionToken.stagger.bloomScale },
    animate: { opacity: 1, scale: 1 },
    transition: transitionFor(motionToken.springs.gentle, reduced),
  };

  const swatchContainer = {
    hidden: {},
    visible: { transition: { staggerChildren: reduced ? 0 : SWATCH_STAGGER_S } },
  };
  const swatchItem = {
    hidden: { opacity: 0, scale: reduced ? 1 : 0.8 },
    visible: { opacity: 1, scale: 1 },
  };

  // The era card settles LAST — delayed to eraSettleDelayMs so it lands after
  // the name has bloomed and the palette has cascaded. Reduced motion drops the
  // delay and the rise, landing on a simultaneous fade with everything else.
  const eraEnter = {
    initial: reduced ? { opacity: 0 } : { opacity: 0, y: motionToken.stagger.riseYPx },
    animate: { opacity: 1, y: 0 },
    transition: reduced
      ? transitionFor(motionToken.springs.gentle, reduced)
      : { ...transitionFor(motionToken.springs.gentle, reduced), delay: ERA_SETTLE_S },
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

      {/* This surface earns the Display Fraunces — the archetype name blooms
          first, its glow disc synced to the same bloom via a shared motion. */}
      <motion.div style={nameStyle} initial={nameEnter.initial} animate={nameEnter.animate} transition={nameEnter.transition}>
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
        <Text variant="display" as="h1" style={{ margin: 0, color: 'var(--color-text)' }}>
          {archetypeName}
        </Text>
      </motion.div>

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

      <motion.div
        style={eraCardStyle}
        initial={eraEnter.initial}
        animate={eraEnter.animate}
        transition={eraEnter.transition}
      >
        <Text variant="title" as="h2" size="title1" style={eraTitleStyle}>
          {profile.era_suggestion.title}
        </Text>
        <Text variant="body" as="p" style={eraDescStyle}>
          {profile.era_suggestion.description}
        </Text>
      </motion.div>

      <Text variant="caption" as="span" size="footnote" style={keywordStyle}>
        {strings.quiz.revealSubtitle}
      </Text>

      <Button
        onClick={inertCta ? undefined : () => viewTransition(() => router.push('/feed'))}
      >
        {strings.quiz.revealCta}
      </Button>
    </motion.div>
  );
}
