/**
 * ThemeControl — the appearance segmented control.
 *
 * A three-way row (System / Light / Dark) over the existing theme provider:
 * each option reflects the current `mode` and calls `setMode` on tap.
 * Persistence lives in the provider (AsyncStorage) — this is a pure presenter
 * built from the shared Chip primitive, so it inherits the chip's haptic +
 * reduced-motion behaviour for free.
 */
import { strings } from '@era/core/strings';
import { spacing } from '@era/tokens';
import { StyleSheet, View } from 'react-native';

import { Chip } from '@/components/Chip';
import { useTheme, type ThemePreference } from '@/lib/theme';

const OPTIONS: readonly { readonly value: ThemePreference; readonly label: string }[] = [
  { value: 'system', label: strings.settings.themeSystem },
  { value: 'light', label: strings.settings.themeLight },
  { value: 'dark', label: strings.settings.themeDark },
];

export function ThemeControl() {
  const { mode, setMode } = useTheme();

  return (
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel={strings.settings.appearance}
      style={styles.row}
    >
      {OPTIONS.map((option) => (
        <Chip
          key={option.value}
          label={option.label}
          selected={mode === option.value}
          // A one-of-three picker — announce as a radio, not a toggle button.
          accessibilityRole="radio"
          // Chip toggles a boolean; here every tap picks this option outright.
          onToggle={() => setMode(option.value)}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: spacing.s2,
  },
});
