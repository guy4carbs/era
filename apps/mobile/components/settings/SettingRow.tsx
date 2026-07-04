/**
 * SettingRow — a tappable settings line.
 *
 * A full-width row with a label on the left and a trailing affordance glyph on
 * the right (a chevron for in-app navigation, an up-right arrow for outbound
 * links). `destructive` recolours the label with the danger token for the
 * delete-account action. Meets the iOS touch target and follows the app's
 * label-only glyph convention (no icon font is bundled).
 */
import { layout, spacing, typeRamp } from '@era/tokens';
import { Pressable, StyleSheet, Text } from 'react-native';

import { useTheme } from '@/lib/theme';

interface SettingRowProps {
  readonly label: string;
  readonly onPress: () => void;
  /** Trailing glyph — '›' for navigation (default), '↗' for an outbound link. */
  readonly trailing?: '›' | '↗';
  /** Danger styling for the account-deletion row. */
  readonly destructive?: boolean;
  readonly accessibilityHint?: string;
}

export function SettingRow({
  label,
  onPress,
  trailing = '›',
  destructive = false,
  accessibilityHint,
}: SettingRowProps) {
  const { colors } = useTheme();
  const labelColor = destructive ? colors.danger : colors.text;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      onPress={onPress}
      style={styles.row}
    >
      <Text
        style={{
          color: labelColor,
          fontSize: typeRamp.body.pt,
          lineHeight: typeRamp.body.lineHeight,
          fontWeight: '500',
        }}
      >
        {label}
      </Text>
      <Text
        aria-hidden
        style={{
          color: destructive ? colors.danger : colors.secondary,
          fontSize: typeRamp.body.pt,
          lineHeight: typeRamp.body.lineHeight,
        }}
      >
        {trailing}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: layout.touchTarget.ios,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.s2,
  },
});
