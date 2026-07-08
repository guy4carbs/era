/**
 * WearHistoryButton — the closet's entry point into the wear calendar.
 *
 * A quiet top-bar affordance beside the SettingsGear that pushes `/worn` (the
 * month recap + calendar). Label-only glyph — the app bundles no icon font (see
 * SettingsGear / OviFab) — sized to the iOS touch target. Reached the same way
 * Settings is: a glyph in the closet header's title row.
 */
import { strings } from '@era/core/strings';
import { layout, spacing, typeRamp } from '@era/tokens';
import { Pressable, StyleSheet, Text } from 'react-native';

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
      <Text style={{ color: colors.text, fontSize: typeRamp.title2.pt }}>▦</Text>
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
