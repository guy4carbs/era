/**
 * Skeleton — warm-cream loading placeholders that shimmer, never gray (D-WAIT).
 *
 * A `colors.surface` block with a diagonal sheen band sweeping across it on an
 * ambient loop. The band follows the sheen token's 135deg grammar, but brightened
 * for cream-on-cream legibility: a faint `palette.white` wash (a low fixed opacity
 * on the gradient view) reading as a glancing light travelling over the cream —
 * NOT the near-invisible 0.05 web sheen, which would vanish on a cream block. The
 * surface tone is the skeleton; the sheen is the motion.
 *
 * The band translates left→right on `withRepeat(withTiming(...))` over
 * `motion.waiting.skeletonSweepMs` (ambient loop, exempt from durations.maxMs the
 * way the orb breath and glow pulse are), on `tokenEasing`.
 *
 * When content arrives the caller swaps the skeleton for the real view; the
 * standard `motion.durations.reducedFadeMs` (150ms) opacity fade carries the
 * change so nothing pops (see `SkeletonSwap`).
 *
 * Reduced motion: the sweep is OFF — a plain static `colors.surface` block.
 *
 * Variants size the block; the caller supplies width via style/flex:
 *   text — a single text line (short, rounded to the chip radius).
 *   card — a 4:5 portrait tile (item-card aspect), rounded to the card radius.
 *   row  — a squat list-row band, rounded to the input radius.
 *
 * HARD LAWS: the only animation is a transform on a child view via
 * withRepeat(withTiming) — no sensors, no derived-value writes. Tokens only.
 */
import { motion, palette, radii, sheen, spacing } from '@era/tokens';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect } from 'react';
import { StyleSheet, View, type LayoutChangeEvent, type StyleProp, type ViewStyle } from 'react-native';
import { useState } from 'react';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { tokenEasing, useReducedMotionSafe } from '@/lib/motion';
import { useTheme } from '@/lib/theme';

type SkeletonVariant = 'text' | 'card' | 'row';

const VARIANT_RADIUS: Record<SkeletonVariant, number> = {
  text: radii.chip,
  card: radii.card,
  row: radii.input,
};

interface SkeletonProps {
  readonly variant?: SkeletonVariant;
  readonly style?: StyleProp<ViewStyle>;
}

export function Skeleton({ variant = 'text', style }: SkeletonProps) {
  const { colors } = useTheme();
  const reduced = useReducedMotionSafe();
  // Measured width drives how far the sheen band travels — it sweeps from just
  // off the left edge to just off the right, so the highlight fully clears.
  const [width, setWidth] = useState(0);
  const progress = useSharedValue(0);

  useEffect(() => {
    if (reduced || width === 0) {
      progress.value = 0;
      return;
    }
    progress.value = withRepeat(
      withTiming(1, { duration: motion.waiting.skeletonSweepMs, easing: tokenEasing }),
      -1,
      false,
    );
  }, [reduced, width, progress]);

  // The band is ~60% of the block wide; it starts fully off the left (-bandWidth)
  // and ends fully off the right (+width), so the sweep enters and exits cleanly.
  const bandWidth = Math.max(width * 0.6, 1);
  const sweepStyle = useAnimatedStyle(() => ({
    transform: [
      {
        translateX: -bandWidth + progress.value * (width + bandWidth),
      },
    ],
  }));

  const radius = VARIANT_RADIUS[variant];
  const onLayout = (e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width);

  return (
    <View
      onLayout={onLayout}
      // Decorative placeholder — hidden from assistive tech; the surrounding
      // OviLoader/progressbar carries the "busy" announcement.
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[
        variant === 'card' && styles.card,
        variant === 'row' && styles.row,
        variant === 'text' && styles.text,
        { backgroundColor: colors.surface, borderRadius: radius, borderCurve: 'continuous' },
        style,
      ]}
    >
      {reduced || width === 0 ? null : (
        <Animated.View style={[styles.band, { width: bandWidth }, sweepStyle]} pointerEvents="none">
          {/* The brightened sheen: white wash, faint by 60% of the run, at a low
              fixed opacity so it reads on cream without ever looking metallic. */}
          <LinearGradient
            colors={[palette.white, palette.white, colors.surface]}
            locations={[0, sheen.stopPercent / 100, 1]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[StyleSheet.absoluteFill, styles.sheen]}
          />
        </Animated.View>
      )}
    </View>
  );
}

/**
 * SkeletonSwap — cross-fades from a skeleton to real content with no pop.
 *
 * While `loading`, renders `skeleton`; once content is ready it renders
 * `children` and fades them in over `motion.durations.reducedFadeMs` (150ms).
 * Reduced motion collapses the fade to an instant show (same 150ms token path).
 */
export function SkeletonSwap({
  loading,
  skeleton,
  children,
}: {
  readonly loading: boolean;
  readonly skeleton: React.ReactNode;
  readonly children: React.ReactNode;
}) {
  const opacity = useSharedValue(loading ? 0 : 1);

  useEffect(() => {
    if (!loading) {
      opacity.value = withTiming(1, {
        duration: motion.durations.reducedFadeMs,
        easing: tokenEasing,
      });
    } else {
      opacity.value = 0;
    }
  }, [loading, opacity]);

  const fade = useAnimatedStyle(() => ({ opacity: opacity.value }));

  if (loading) return <>{skeleton}</>;
  return <Animated.View style={fade}>{children}</Animated.View>;
}

const styles = StyleSheet.create({
  text: {
    height: spacing.s4,
    overflow: 'hidden',
  },
  card: {
    aspectRatio: 4 / 5,
    width: '100%',
    overflow: 'hidden',
  },
  row: {
    height: spacing.s12,
    width: '100%',
    overflow: 'hidden',
  },
  band: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
  },
  sheen: {
    // The wash never reaches full white — this ceiling keeps it a glancing
    // light on cream, not a mirror.
    opacity: 0.5,
  },
});
