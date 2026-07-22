/**
 * OviSuggestion — Ovi's ambient presence beyond the panel (D-AMBIENT, mobile).
 *
 * A small glass strip that lets Ovi speak a single, earned line from where the
 * user already is — the closet, a piece's detail, the design canvas, the shop —
 * without ever opening the sheet or blocking the flow. It mirrors the web
 * treatment exactly: the 20px orb at idle (present, not interactive), ONE Italic
 * line (the sanctioned small-serif `oviAccent` exception), ONE action, and a
 * quiet dismiss. Tapping the line or the action opens Ovi PRE-SEEDED with the
 * suggestion's intent (via the shared open channel), so the answer is one tap
 * away; dismissing — or tapping — retires the strip.
 *
 * Presence rules baked in:
 *   - It waits. Nothing appears until `motion.suggestion.settleDelayMs` (800ms)
 *     after mount, so the screen lands first and the whisper arrives after — a
 *     quiet fade-rise (opacity + a small translateY on the gentle spring). Under
 *     reduced motion it fades in, in place, after the same beat.
 *   - It stays gone. Dismissal is persisted per `suggestion.key` in AsyncStorage
 *     (the era-reveal-seen pattern, best-effort) so a retired look never nags
 *     again — but a genuinely new suggestion (a new key) can still speak.
 *   - It never overlaps. Callers place it in normal flow (top of the list content
 *     or just below the header), never floated over actions.
 *
 * The composers (`suggestForCloset` / `suggestForItem` / `suggestForDesign` in
 * @era/core/ovi) return `null` when there's nothing honest to say, so a caller
 * renders no strip at all rather than an empty one.
 */
import type { OviSuggestion as OviSuggestionData } from '@era/core/ovi';
import { strings } from '@era/core/strings';
import { motion as motionTokens, orb as orbToken, radii, rnShadow, spacing } from '@era/tokens';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { GlassPanel } from '@/components/GlassPanel';
import { Press } from '@/components/Press';
import { Text } from '@/components/Text';
import { springFromToken, tokenEasing, useReducedMotionSafe } from '@/lib/motion';
import { useTheme } from '@/lib/theme';

import { OviOrb } from './OviOrb';

/** The AsyncStorage key holding the JSON array of dismissed suggestion keys. */
const DISMISSED_KEY = 'era-ovi-suggest-dismissed';

interface OviSuggestionProps {
  /** The composed suggestion, or null when there's nothing to say (no strip). */
  readonly suggestion: OviSuggestionData | null;
  /** Open Ovi pre-seeded with this suggestion's intent + focal piece. */
  readonly onOpen: (suggestion: OviSuggestionData) => void;
  /** Optional: notify the host a strip was dismissed (e.g. to relayout). */
  readonly onDismiss?: (suggestion: OviSuggestionData) => void;
}

/**
 * Read the dismissed-keys set from storage (best-effort — a parse/read miss just
 * yields an empty set, so a storage hiccup shows the strip rather than hiding it).
 */
async function readDismissed(): Promise<ReadonlySet<string>> {
  try {
    const raw = await AsyncStorage.getItem(DISMISSED_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? new Set(parsed.filter((k): k is string => typeof k === 'string')) : new Set();
  } catch {
    return new Set();
  }
}

/** Append `key` to the persisted dismissed set (best-effort, idempotent). */
async function persistDismissed(key: string): Promise<void> {
  try {
    const current = await readDismissed();
    if (current.has(key)) return;
    const next = [...current, key];
    await AsyncStorage.setItem(DISMISSED_KEY, JSON.stringify(next));
  } catch {
    // A write miss just means the strip may speak again next launch — never fatal.
  }
}

export function OviSuggestion({ suggestion, onOpen, onDismiss }: OviSuggestionProps) {
  const { colors, resolved } = useTheme();
  const reduced = useReducedMotionSafe();

  // Three-state visibility while the dismissed-set hydrates:
  //   null  — still reading storage (hold, never flash a since-dismissed strip)
  //   false — this key was dismissed (or locally retired this session): no strip
  //   true  — clear to show
  const [visible, setVisible] = useState<boolean | null>(null);

  // Entrance shared values — start hidden and below, settle after the delay.
  const opacity = useSharedValue(0);
  const translateY = useSharedValue(reduced ? 0 : motionTokens.stagger.riseYPx);

  const key = suggestion?.key ?? null;

  // Hydrate the dismissed set for THIS suggestion key. Re-runs when the key
  // changes (a genuinely new composition), so a fresh look re-evaluates.
  useEffect(() => {
    if (!key) {
      setVisible(false);
      return;
    }
    let active = true;
    setVisible(null);
    void readDismissed().then((dismissed) => {
      if (active) setVisible(!dismissed.has(key));
    });
    return () => {
      active = false;
    };
  }, [key]);

  // The settle-then-rise entrance: wait the suggestion delay past mount, then
  // fade in (+ rise on the gentle spring). Reduced motion fades only, after the
  // same delay. Runs once the strip is cleared to show.
  useEffect(() => {
    if (visible !== true) return;
    const delay = motionTokens.suggestion.settleDelayMs;
    if (reduced) {
      opacity.value = withDelay(
        delay,
        withTiming(1, { duration: motionTokens.durations.reducedFadeMs, easing: tokenEasing }),
      );
      return;
    }
    opacity.value = withDelay(
      delay,
      withTiming(1, { duration: motionTokens.durations.minMs, easing: tokenEasing }),
    );
    translateY.value = withDelay(delay, withSpring(0, springFromToken('gentle')));
  }, [visible, reduced, opacity, translateY]);

  const entranceStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }],
  }));

  const dismiss = () => {
    if (!suggestion) return;
    setVisible(false);
    void persistDismissed(suggestion.key);
    onDismiss?.(suggestion);
  };

  const open = () => {
    if (!suggestion) return;
    // A tap retires the strip AND opens Ovi seeded — the same look shouldn't
    // linger behind the answer it just launched.
    setVisible(false);
    void persistDismissed(suggestion.key);
    onOpen(suggestion);
  };

  // No strip while composing to null, before hydration resolves, or once retired.
  if (!suggestion || visible !== true) return null;

  return (
    <Animated.View style={[styles.wrap, rnShadow('e1', resolved), entranceStyle]}>
      <GlassPanel radius={radii.card} shadow={null} style={styles.panel}>
        {/* The orb is presence, not a control — idle breath at whisper size, and
            hidden from assistive tech (the line carries the meaning). */}
        <View
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          pointerEvents="none"
        >
          <OviOrb state="idle" sizePx={orbToken.size.whisperPx} />
        </View>

        {/* The line is the tappable body — one Italic sentence, one line, opening
            Ovi seeded. The sanctioned small-serif exception (oviAccent). */}
        <Press
          haptic="selection"
          onPress={open}
          hitSlop={spacing.s2}
          style={styles.lineWrap}
          accessibilityRole="button"
          accessibilityLabel={suggestion.line}
        >
          <Text variant="oviAccent" size="subhead" color={colors.text} numberOfLines={1}>
            {suggestion.line}
          </Text>
        </Press>

        {/* The one action — same seeded open as the line, in the UI voice. */}
        <Press
          haptic="selection"
          onPress={open}
          hitSlop={spacing.s2}
          style={styles.action}
          accessibilityRole="button"
          accessibilityLabel={suggestion.action}
        >
          <Text variant="ui" size="footnote" weight={600} color={colors.accent}>
            {suggestion.action}
          </Text>
        </Press>

        {/* The quiet dismiss — retires this look for good. */}
        <Press
          haptic="selection"
          onPress={dismiss}
          hitSlop={spacing.s2}
          style={styles.dismiss}
          accessibilityRole="button"
          accessibilityLabel={strings.ovi.suggest.dismissA11y}
        >
          <Text variant="ui" size="subhead" color={colors.secondaryStrong}>
            ×
          </Text>
        </Press>
      </GlassPanel>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  // The outer wrapper owns the resting e1 lift + the entrance transform; the
  // GlassPanel inside stays flat (its own shadow null) so the material and the
  // shadow don't double up.
  wrap: {
    borderRadius: radii.card,
  },
  panel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s3,
    paddingVertical: spacing.s2,
    paddingHorizontal: spacing.s3,
  },
  // The line takes the row's flex so a long sentence truncates to one line
  // rather than pushing the action or dismiss off the edge.
  lineWrap: {
    flex: 1,
  },
  action: {
    // Keeps the action optically clear of the dismiss without a heavy divider.
    paddingHorizontal: spacing.s1,
  },
  dismiss: {
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: spacing.s4,
  },
});
