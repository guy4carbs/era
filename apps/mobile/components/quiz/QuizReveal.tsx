/**
 * QuizReveal — the payoff screen after the twelve steps.
 *
 * Leads with the "your era begins" eyebrow, blooms an accent glow, names the
 * archetype in a sans large-title, lists the style keywords, staggers in the
 * palette swatches, and presents the starter era — its title in the editorial
 * serif — with a grounding line and a single "Step in" call to action into the
 * feed. Under reduced motion the glow holds static and the swatches appear at
 * once — no bloom, no stagger.
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
import { useEffect } from 'react';

import { strings } from '@era/core/strings';

import { Button } from '@/components/Button';
import { Text } from '@/components/Text';
import { springFromToken, tokenEasing, useReducedMotionSafe } from '@/lib/motion';
import { useTheme } from '@/lib/theme';

import type { RevealData } from './contract';

const GLOW_SIZE = spacing.s16 + spacing.s12; // large soft disc behind the title
const STAGGER_MS = motion.stagger.delayMs;

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
        <Text
          accessibilityRole="header"
          variant="ui"
          size="largeTitle"
          weight={700}
          color={colors.text}
          style={styles.archetype}
        >
          {profile.archetypeName}
        </Text>
      </View>

      {profile.keywords.length > 0 ? (
        <View style={styles.keywords}>
          {profile.keywords.map((word) => (
            <View key={word} style={[styles.keyword, { backgroundColor: `${colors.accent}29`, borderColor: colors.accent }]}>
              <Text variant="ui" size="footnote" weight={400} color={colors.text}>
                {word}
              </Text>
            </View>
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

      <View style={[styles.eraCard, rnShadow('e2', resolved), { backgroundColor: colors.surface, borderColor: colors.hairline }]}>
        <Text variant="oviAccent" color={colors.text}>
          {profile.eraTitle}
        </Text>
        <Text variant="body" color={colors.secondaryStrong}>
          {profile.eraDescription}
        </Text>
      </View>

      <Text variant="caption" size="footnote" color={colors.secondaryStrong} style={{ textAlign: 'center' }}>
        {strings.quiz.revealSubtitle}
      </Text>

      <Button label={strings.quiz.revealCta} onPress={onStepIn} haptic />
    </View>
  );
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

/** One palette swatch; fades and scales in on a per-index delay (static if reduced). */
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
      index * STAGGER_MS,
      withTiming(1, { duration: motion.durations.minMs, easing: tokenEasing }),
    );
    scale.value = withDelay(index * STAGGER_MS, withSpring(1, springFromToken('gentle')));
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
    // Sans, per spec — the editorial serif is reserved for the era title only.
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
