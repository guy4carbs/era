/**
 * FailedLoad — the editorial "this didn't load" state (D-WAIT).
 *
 * When a whole surface can't load, we don't stack a red error banner — we say it
 * plainly in the serif register and offer ONE way forward. `strings.errors.failedLoad`
 * renders as a `title` (Fraunces, above the 20px serif floor), with a single
 * `errors.retry` Button below it. Calm, no blame, no exclamation.
 *
 * A surface-specific line may override the default via `line` (e.g. a closet or
 * shop voice line that already exists) while keeping the same editorial frame.
 *
 * Centered with generous rhythm; sized to sit inside a page body, not a toast.
 */
import { spacing } from '@era/tokens';
import { strings } from '@era/core/strings';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { Button } from '@/components/Button';
import { Text } from '@/components/Text';
import { useTheme } from '@/lib/theme';

interface FailedLoadProps {
  readonly onRetry: () => void;
  /** Override the default failedLoad line with a surface-specific one. */
  readonly line?: string;
  /** Override the retry button label (defaults to errors.retry). */
  readonly retryLabel?: string;
  readonly style?: StyleProp<ViewStyle>;
}

export function FailedLoad({ onRetry, line, retryLabel, style }: FailedLoadProps) {
  const { colors } = useTheme();

  return (
    <View style={[styles.wrap, style]}>
      {/* Serif register — the miss stated editorially, never a warning banner. */}
      <Text variant="title" color={colors.text} style={styles.line}>
        {line ?? strings.errors.failedLoad}
      </Text>
      <Button
        label={retryLabel ?? strings.errors.retry}
        variant="secondary"
        onPress={onRetry}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.s6,
    paddingVertical: spacing.s8,
    paddingHorizontal: spacing.s6,
  },
  line: {
    textAlign: 'center',
  },
});
