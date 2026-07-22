/**
 * QuizReveal — the payoff screen after the twelve steps.
 *
 * Leads with the "your era begins" eyebrow, then plays the D-QUIZ reveal
 * choreography — deliberately one notch below the daily ritual in weight:
 *
 *   1. The archetype name BLOOMS FIRST — scale from `motion.stagger.bloomScale`
 *      + fade on the gentle spring, synced with the GlowBloom disc behind it
 *      (both fire on mount, no delay).
 *   2. The palette swatches CASCADE in on the `quizReveal.swatchStaggerMs` beat.
 *      The keyword chips join the same cascade (a light fade-rise) so the hero
 *      builds as one gesture rather than snapping in.
 *   3. The starter era card SETTLES LAST at `withDelay(quizReveal.eraSettleDelayMs)`
 *      — a fade-rise so it reads as the closing beat.
 *
 * Timing budget (must fit `quizReveal.maxTotalMs` = 1800ms):
 *   - name bloom: starts 0ms, gentle spring settles < durations.maxMs (350) ⇒ ~350ms
 *   - swatches:   last of ≤5 starts (5-1)×45 = 180ms, +350 settle ⇒ ~530ms
 *   - era card:   starts 900ms (eraSettleDelayMs), +350 settle ⇒ ~1250ms ≤ 1800 ✓
 *
 * The archetype name renders in the baked Fraunces `largeTitle` face (display is
 * web-only; largeTitle is the sanctioned mobile fallback). Under reduced motion
 * everything appears at once — no bloom, no cascade, no delayed settle.
 */
import { glow, motion, radii, rnShadow, spacing } from '@era/tokens';
import { StyleSheet, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useEffect, type ReactNode } from 'react';

import { strings } from '@era/core/strings';

import { Button } from '@/components/Button';
import { Text } from '@/components/Text';
import { springFromToken, tokenEasing, useReducedMotionSafe } from '@/lib/motion';
import { useTheme } from '@/lib/theme';

import type { RevealData } from './contract';

const GLOW_SIZE = spacing.s16 + spacing.s12; // large soft disc behind the title
// The cascade beat and the era's closing delay come straight from the frozen
// D-QUIZ tokens so the reveal's rhythm is the contract, not a local literal.
const CASCADE_MS = motion.quizReveal.swatchStaggerMs;
const ERA_SETTLE_MS = motion.quizReveal.eraSettleDelayMs;

interface QuizRevealProps {
  readonly profile: RevealData;
  readonly onStepIn: () => void;
}

export function QuizReveal({ profile, onStepIn }: QuizRevealProps) {
  const { colors, resolved } = useTheme();
  const reduced = useReducedMotionSafe();

  return (
    <View style={styles.container}>
      <View style={styles.hero}>
        <GlowBloom color={colors.accent} mode={resolved} reduced={reduced} />
        <Text variant="ui" weight={600} color={colors.secondaryStrong} style={{ textAlign: 'center' }}>
          {strings.quiz.revealTitle}
        </Text>
        {/* The name blooms first — scale-from-bloomScale + fade, synced with the disc. */}
        <NameBloom reduced={reduced}>
          <Text
            accessibilityRole="header"
            variant="largeTitle"
            color={colors.text}
            style={styles.archetype}
          >
            {profile.archetypeName}
          </Text>
        </NameBloom>
      </View>

      {profile.keywords.length > 0 ? (
        <View style={styles.keywords}>
          {profile.keywords.map((word, index) => (
            // Keywords JOIN the swatch cascade — a light fade-rise on the same beat.
            <CascadeItem key={word} index={index} reduced={reduced}>
              <View style={[styles.keyword, { backgroundColor: `${colors.accent}29`, borderColor: colors.accent }]}>
                <Text variant="ui" size="footnote" weight={400} color={colors.text}>
                  {word}
                </Text>
              </View>
            </CascadeItem>
          ))}
        </View>
      ) : null}

      {profile.palette.length > 0 ? (
        <View
          accessibilityRole="image"
          accessibilityLabel={`Your palette: ${profile.palette.length} colours`}
          style={[styles.swatchRow, { borderColor: colors.hairline }]}
        >
          {profile.palette.map((hex, index) => (
            <Swatch key={`${hex}-${index}`} hex={hex} index={index} reduced={reduced} />
          ))}
        </View>
      ) : null}

      {/* The era card settles LAST — the closing beat of the reveal. */}
      <EraSettle reduced={reduced}>
        <View style={[styles.eraCard, rnShadow('e2', resolved), { backgroundColor: colors.surface, borderColor: colors.hairline }]}>
          <Text variant="oviAccent" color={colors.text}>
            {profile.eraTitle}
          </Text>
          <Text variant="body" color={colors.secondaryStrong}>
            {profile.eraDescription}
          </Text>
        </View>
      </EraSettle>

      <Text variant="caption" size="footnote" color={colors.secondaryStrong} style={{ textAlign: 'center' }}>
        {strings.quiz.revealSubtitle}
      </Text>

      <Button label={strings.quiz.revealCta} onPress={onStepIn} haptic />
    </View>
  );
}

/**
 * NameBloom — the archetype name grows from `bloomScale` + fades on the gentle
 * spring (fired on mount, synced with the glow disc). Static under reduced motion.
 */
function NameBloom({ reduced, children }: { reduced: boolean; children: ReactNode }) {
  const opacity = useSharedValue(reduced ? 1 : 0);
  const scale = useSharedValue(reduced ? 1 : motion.stagger.bloomScale);

  useEffect(() => {
    if (reduced) {
      opacity.value = 1;
      scale.value = 1;
      return;
    }
    opacity.value = withTiming(1, { duration: motion.durations.minMs, easing: tokenEasing });
    scale.value = withSpring(1, springFromToken('gentle'));
  }, [reduced, opacity, scale]);

  const style = useAnimatedStyle(() => ({ opacity: opacity.value, transform: [{ scale: scale.value }] }));
  return <Animated.View style={style}>{children}</Animated.View>;
}

/**
 * CascadeItem — a keyword chip riding the shared cascade beat: a light fade-rise
 * delayed by `index × CASCADE_MS`, so keywords stream in with the swatches.
 * Static under reduced motion.
 */
function CascadeItem({ index, reduced, children }: { index: number; reduced: boolean; children: ReactNode }) {
  const opacity = useSharedValue(reduced ? 1 : 0);
  const translateY = useSharedValue(reduced ? 0 : motion.stagger.riseYPx);

  useEffect(() => {
    if (reduced) {
      opacity.value = 1;
      translateY.value = 0;
      return;
    }
    opacity.value = withDelay(index * CASCADE_MS, withTiming(1, { duration: motion.durations.minMs, easing: tokenEasing }));
    translateY.value = withDelay(index * CASCADE_MS, withSpring(0, springFromToken('gentle')));
  }, [index, reduced, opacity, translateY]);

  const style = useAnimatedStyle(() => ({ opacity: opacity.value, transform: [{ translateY: translateY.value }] }));
  return <Animated.View style={style}>{children}</Animated.View>;
}

/**
 * EraSettle — the starter era card's closing beat: a fade-rise delayed by
 * `ERA_SETTLE_MS` so it lands after the hero has bloomed and the swatches have
 * cascaded. Static under reduced motion.
 */
function EraSettle({ reduced, children }: { reduced: boolean; children: ReactNode }) {
  const opacity = useSharedValue(reduced ? 1 : 0);
  const translateY = useSharedValue(reduced ? 0 : motion.stagger.riseYPx);

  useEffect(() => {
    if (reduced) {
      opacity.value = 1;
      translateY.value = 0;
      return;
    }
    opacity.value = withDelay(ERA_SETTLE_MS, withTiming(1, { duration: motion.durations.minMs, easing: tokenEasing }));
    translateY.value = withDelay(ERA_SETTLE_MS, withSpring(0, springFromToken('gentle')));
  }, [reduced, opacity, translateY]);

  const style = useAnimatedStyle(() => ({ opacity: opacity.value, transform: [{ translateY: translateY.value }] }));
  return <Animated.View style={style}>{children}</Animated.View>;
}

/** A soft accent disc that blooms up on mount; static under reduced motion. */
function GlowBloom({ color, mode, reduced }: { color: string; mode: 'light' | 'dark'; reduced: boolean }) {
  const baseOpacity = glow.opacity[mode];
  const scale = useSharedValue(reduced ? 1 : 0.6);
  const opacity = useSharedValue(reduced ? baseOpacity : 0);

  useEffect(() => {
    if (reduced) {
      scale.value = 1;
      opacity.value = baseOpacity;
      return;
    }
    scale.value = withSpring(1, springFromToken('gentle'));
    opacity.value = withTiming(baseOpacity, {
      duration: motion.durations.maxMs,
      easing: tokenEasing,
    });
  }, [reduced, baseOpacity, scale, opacity]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ scale: scale.value }],
  }));

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.glow,
        {
          backgroundColor: color,
          shadowColor: color,
          shadowRadius: glow.blurRadius,
          shadowOpacity: 1,
          shadowOffset: { width: 0, height: 0 },
        },
        animatedStyle,
      ]}
    />
  );
}

/**
 * One palette swatch; fades and scales in on the `CASCADE_MS` beat per index
 * (static if reduced) — the swatch cascade retimed to the frozen D-QUIZ token.
 */
function Swatch({ hex, index, reduced }: { hex: string; index: number; reduced: boolean }) {
  const opacity = useSharedValue(reduced ? 1 : 0);
  const scale = useSharedValue(reduced ? 1 : 0.9);

  useEffect(() => {
    if (reduced) {
      opacity.value = 1;
      scale.value = 1;
      return;
    }
    opacity.value = withDelay(
      index * CASCADE_MS,
      withTiming(1, { duration: motion.durations.minMs, easing: tokenEasing }),
    );
    scale.value = withDelay(index * CASCADE_MS, withSpring(1, springFromToken('gentle')));
  }, [reduced, index, opacity, scale]);

  const animatedStyle = useAnimatedStyle(() => ({ opacity: opacity.value, transform: [{ scale: scale.value }] }));

  return <Animated.View style={[styles.swatch, { backgroundColor: hex }, animatedStyle]} />;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: spacing.s6,
    gap: spacing.s6,
  },
  hero: {
    alignItems: 'center',
    gap: spacing.s3,
  },
  glow: {
    position: 'absolute',
    top: -spacing.s8,
    width: GLOW_SIZE,
    height: GLOW_SIZE,
    borderRadius: GLOW_SIZE / 2,
  },
  archetype: {
    // Baked Fraunces largeTitle — the display face is web-only; largeTitle is the
    // sanctioned mobile fallback for the archetype name.
    textAlign: 'center',
  },
  keywords: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: spacing.s2,
  },
  keyword: {
    paddingVertical: spacing.s1,
    paddingHorizontal: spacing.s3,
    borderRadius: radii.chip,
    borderWidth: StyleSheet.hairlineWidth,
    borderCurve: 'continuous',
  },
  swatchRow: {
    flexDirection: 'row',
    alignSelf: 'center',
    height: spacing.s12,
    borderRadius: radii.chip,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
  },
  swatch: {
    width: spacing.s12,
    height: '100%',
  },
  eraCard: {
    padding: spacing.s6,
    gap: spacing.s2,
    borderRadius: radii.hero,
    borderWidth: StyleSheet.hairlineWidth,
    borderCurve: 'continuous',
  },
});
