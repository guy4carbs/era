/**
 * OviLoader — waiting is Ovi breathing, never a spinner (D-WAIT).
 *
 * Loading everywhere in the app is the OviOrb held in its IDLE state: the
 * dimensional cream sphere breathing on the shared heartbeat, carrying its soft
 * accent glow. No `ActivityIndicator` — Ovi is present while the app fetches, so
 * a wait reads as her thinking, not as dead chrome.
 *
 * Two variants, both on the same idle orb:
 *   inline — the whisper size (`orb.size.whisperPx`, 20px): a quiet presence in a
 *            row, with an optional caption beside it. For in-context waits
 *            (a button's own busy beat, a sub-section loading).
 *   page   — the corner size (`orb.size.cornerPx`, 44px): centered in its box with
 *            generous rhythm and an optional caption below. For route/session
 *            guards and full-surface loads.
 *
 * Accessibility: the wrapper is a `progressbar` in the busy state so assistive
 * tech announces the wait; the caption (if any) is the accessible label.
 *
 * Reduced motion: OviOrb already pins itself static (no breath, glow at base) —
 * nothing here needs to branch on it.
 */
import { orb as orbToken, spacing } from '@era/tokens';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { OviOrb } from '@/components/ovi/OviOrb';
import { Text } from '@/components/Text';
import { useTheme } from '@/lib/theme';

interface OviLoaderProps {
  /** inline = whisper orb in a row; page = corner orb centered. */
  readonly variant?: 'inline' | 'page';
  /** Optional quiet caption — beside the orb (inline) or below it (page). */
  readonly caption?: string;
  readonly style?: StyleProp<ViewStyle>;
}

export function OviLoader({ variant = 'inline', caption, style }: OviLoaderProps) {
  const { colors } = useTheme();

  const a11y = {
    accessible: true,
    accessibilityRole: 'progressbar' as const,
    accessibilityState: { busy: true },
    accessibilityLabel: caption,
  };

  if (variant === 'page') {
    return (
      <View {...a11y} style={[styles.page, style]}>
        {/* Idle orb at the corner size — Ovi breathing while the surface loads. */}
        <OviOrb state="idle" size="cornerPx" />
        {caption ? (
          <Text
            variant="body"
            size="subhead"
            color={colors.secondaryStrong}
            style={styles.pageCaption}
          >
            {caption}
          </Text>
        ) : null}
      </View>
    );
  }

  return (
    <View {...a11y} style={[styles.inline, style]}>
      {/* Idle orb at the whisper size — the quietest presence. */}
      <OviOrb state="idle" sizePx={orbToken.size.whisperPx} />
      {caption ? (
        <Text variant="ui" size="footnote" color={colors.secondaryStrong}>
          {caption}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  inline: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s2,
  },
  page: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.s6,
    paddingVertical: spacing.s8,
  },
  pageCaption: {
    textAlign: 'center',
  },
});
