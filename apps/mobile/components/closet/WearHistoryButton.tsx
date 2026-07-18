/**
 * WearHistoryButton — the closet's entry point into the wear calendar.
 *
 * A quiet top-bar affordance beside the SettingsGear that pushes `/worn` (the
 * month recap + calendar). Label-only glyph — the app bundles no icon font (see
 * SettingsGear / OviFab) — sized to the iOS touch target. Reached the same way
 * Settings is: a glyph in the closet header's title row.
 */
import { strings } from '@era/core/strings';
import { layout, spacing } from '@era/tokens';
import { Pressable, StyleSheet } from 'react-native';

import { Text } from '@/components/Text';
import { useTheme } from '@/lib/theme';

interface WearHistoryButtonProps {
  readonly onPress: () => void;
}

export function WearHistoryButton({ onPress }: WearHistoryButtonProps) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={strings.wear.calendar.title}
      hitSlop={spacing.s3}
      onPress={onPress}
      style={styles.button}
    >
      <Text variant="ui" size="title2" color={colors.text}>▦</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    minWidth: layout.touchTarget.ios,
    minHeight: layout.touchTarget.ios,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
