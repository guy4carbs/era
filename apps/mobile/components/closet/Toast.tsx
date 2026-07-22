/**
 * Toast — a brief, self-dismissing status line pinned above the tab bar.
 *
 * A BUSY glass pill (GlassPanel): it floats above the tab bar, potentially over
 * feed/closet imagery, so the AA scrim tint guarantees the label stays legible.
 * On busy glass the tint IS the surface colour, so the label renders in
 * `colors.text` — exactly the text-on-glass pair the contrast audit certifies
 * (previously an opaque inverted pill, `colors.text` bg / `colors.bg` text).
 *
 * Fades in when `message` is set and auto-clears after `motion.waiting.toastDismissMs`
 * (2500ms — the quiet D-WAIT cadence; the parent owns the message state and clears
 * it via `onHide`). Reduced motion collapses the fade to an instant show/hide.
 *
 * Three variants, all the same glass pill:
 *   default — the plain confirmation ("archived", "saved").
 *   error   — a 1px muted-rust hairline (colors.rust at reduced opacity — quiet,
 *             never a red banner) and `accessibilityRole="alert"`. The line is
 *             calm Geist; callers with no specific copy pass `strings.errors.transient`.
 *   success — a small glow bloom on entrance (the accent glow blooms base→peak→
 *             settle as the pill fades in), for a completed action worth a beat.
 *
 * Rust is a UI/graphical token (3:1, non-text) — it is the hairline ACCENT only;
 * the label text always stays `colors.text` (body-safe on the scrim).
 */
import { glow, motion, radii, spacing } from '@era/tokens';
import { useEffect } from 'react';
import { StyleSheet } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { GlassPanel } from '@/components/GlassPanel';
import { Text } from '@/components/Text';
import { tokenEasing, useReducedMotionSafe } from '@/lib/motion';
import { useTheme } from '@/lib/theme';

/** The quiet auto-dismiss cadence — the D-WAIT waiting token. */
const VISIBLE_MS = motion.waiting.toastDismissMs;

/** The muted-rust hairline opacity — present, never a red alarm. */
const ERROR_HAIRLINE_OPACITY = 0.5;

export type ToastVariant = 'default' | 'error' | 'success';

interface ToastProps {
  readonly message: string | null;
  readonly onHide: () => void;
  /** Bottom offset (px) so the toast clears the tab bar + home indicator. */
  readonly bottom: number;
  /** default | error (rust hairline + alert) | success (glow bloom). */
  readonly variant?: ToastVariant;
}

export function Toast({ message, onHide, bottom, variant = 'default' }: ToastProps) {
  const { colors, resolved } = useTheme();
  const reduced = useReducedMotionSafe();
  const opacity = useSharedValue(0);
  // Success bloom: the accent glow rides 0 → peak → settle as the pill enters.
  const bloom = useSharedValue(0);

  useEffect(() => {
    if (!message) return;
    const fade = (to: number) =>
      reduced
        ? withTiming(to, { duration: 0 })
        : withTiming(to, { duration: motion.durations.reducedFadeMs, easing: tokenEasing });
    opacity.value = fade(1);

    // Only success blooms, and only when motion is allowed.
    if (variant === 'success' && !reduced) {
      bloom.value = withSequence(
        withTiming(1, { duration: motion.durations.minMs, easing: tokenEasing }),
        withDelay(
          motion.durations.minMs,
          withTiming(0.4, { duration: motion.durations.maxMs, easing: tokenEasing }),
        ),
      );
    } else {
      bloom.value = 0;
    }

    const timer = setTimeout(() => {
      opacity.value = fade(0);
      onHide();
    }, VISIBLE_MS);
    return () => clearTimeout(timer);
  }, [message, reduced, variant, opacity, bloom, onHide]);

  const style = useAnimatedStyle(() => ({ opacity: opacity.value }));

  // The success glow: an accent-tinted shadow whose opacity rides the bloom.
  const bloomStyle = useAnimatedStyle(() => ({
    shadowOpacity: bloom.value * glow.opacity[resolved] * (1 + glow.pulse.amount),
  }));

  if (!message) return null;

  const isError = variant === 'error';
  const isSuccess = variant === 'success';

  return (
    <Animated.View
      // Errors announce assertively (alert); default/success announce politely
      // via the live region — RN has no 'status' accessibilityRole.
      accessibilityRole={isError ? 'alert' : undefined}
      accessibilityLiveRegion={isError ? 'assertive' : 'polite'}
      pointerEvents="none"
      style={[
        styles.toast,
        style,
        { bottom },
        isSuccess && {
          shadowColor: colors.accent,
          shadowRadius: glow.blurRadius,
          shadowOffset: { width: 0, height: 0 },
        },
        isSuccess && bloomStyle,
      ]}
    >
      {/* busy glass: AA scrim over imagery; e3 lifts the pill off the content. */}
      <GlassPanel busy radius={radii.input} shadow="e3" style={styles.pill}>
        <Text variant="caption" size="subhead" color={colors.text} style={styles.label}>
          {message}
        </Text>
        {/* Error hairline: a rust border laid over the pill at reduced opacity so
            it frames the line quietly — the label above keeps full contrast. */}
        {isError ? (
          <Animated.View
            pointerEvents="none"
            style={[
              StyleSheet.absoluteFill,
              styles.errorHairline,
              { borderColor: colors.danger, borderRadius: radii.input, borderCurve: 'continuous' },
            ]}
          />
        ) : null}
      </GlassPanel>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  toast: {
    position: 'absolute',
    left: spacing.s4,
    right: spacing.s4,
  },
  pill: {
    paddingVertical: spacing.s3,
    paddingHorizontal: spacing.s4,
  },
  label: { textAlign: 'center' },
  // The error hairline: a 1px rust frame at reduced opacity — present, not loud.
  errorHairline: {
    borderWidth: 1,
    opacity: ERROR_HAIRLINE_OPACITY,
  },
});
