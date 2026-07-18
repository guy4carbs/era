/**
 * SettingsGear — the closet's entry point into Settings.
 *
 * A top-right gear affordance shared by BOTH the stocked closet header and the
 * empty-closet state, so a brand-new user (zero items) can still reach theme,
 * privacy, legal, sign-out, and delete before adding a first piece. Label-only
 * glyph — the app bundles no icon font (see OviFab) — sized to the iOS touch
 * target.
 */
import { strings } from '@era/core/strings';
import { layout, spacing } from '@era/tokens';
import { StyleSheet } from 'react-native';

import { Press } from '@/components/Press';
import { Text } from '@/components/Text';
import { useTheme } from '@/lib/theme';

interface SettingsGearProps {
  readonly onPress: () => void;
}

export function SettingsGear({ onPress }: SettingsGearProps) {
  const { colors } = useTheme();
  return (
    <Press
      accessibilityRole="button"
      accessibilityLabel={strings.settings.title}
      hitSlop={spacing.s3}
      onPress={onPress}
      style={styles.gear}
    >
      <Text variant="ui" size="title2" color={colors.text}>⚙</Text>
    </Press>
  );
}

const styles = StyleSheet.create({
  gear: {
    minWidth: layout.touchTarget.ios,
    minHeight: layout.touchTarget.ios,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
});
