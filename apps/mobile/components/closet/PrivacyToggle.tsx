/**
 * PrivacyToggle — the closet's public/private switch.
 *
 * Reads `GET /api/profile/privacy` on mount and writes `PATCH` on toggle. The
 * flip is optimistic: local state moves immediately, then reverts if the server
 * rejects. The switch reads as "Public" when on (accent track), and a hint line
 * spells out who can see the closet either way. A selection haptic fires on tap.
 */
import { strings } from '@era/core/strings';
import { spacing, typeRamp } from '@era/tokens';
import * as Haptics from 'expo-haptics';
import { useEffect, useState } from 'react';
import { StyleSheet, Switch, Text, View } from 'react-native';

import { getPrivacy, setPrivacy } from '@/components/items';
import { useTheme } from '@/lib/theme';

export function PrivacyToggle() {
  const { colors } = useTheme();
  // null while the initial value is loading — the switch stays disabled until then.
  const [isPrivate, setIsPrivate] = useState<boolean | null>(null);

  useEffect(() => {
    let active = true;
    void getPrivacy()
      .then((value) => {
        if (active) setIsPrivate(value);
      })
      .catch(() => {
        // Default to private (the safe assumption) if the read fails.
        if (active) setIsPrivate(true);
      });
    return () => {
      active = false;
    };
  }, []);

  async function toggle(nextPublic: boolean) {
    const nextPrivate = !nextPublic;
    const previous = isPrivate;
    setIsPrivate(nextPrivate); // optimistic
    void Haptics.selectionAsync();
    try {
      const stored = await setPrivacy(nextPrivate);
      setIsPrivate(stored);
    } catch {
      setIsPrivate(previous ?? true); // revert
    }
  }

  const isPublic = isPrivate === false;
  const hint = isPublic ? strings.closet.privacyHintPublic : strings.closet.privacyHintPrivate;

  return (
    <View style={styles.container}>
      <View style={styles.row}>
        <Text
          style={{
            color: colors.text,
            fontSize: typeRamp.subhead.pt,
            lineHeight: typeRamp.subhead.lineHeight,
            fontWeight: '600',
          }}
        >
          {isPublic ? strings.closet.privacyPublic : strings.closet.privacyPrivate}
        </Text>
        <Switch
          value={isPublic}
          onValueChange={toggle}
          disabled={isPrivate === null}
          trackColor={{ true: colors.accent, false: colors.hairline }}
          thumbColor={colors.bg}
          ios_backgroundColor={colors.hairline}
          accessibilityRole="switch"
          accessibilityLabel={isPublic ? strings.closet.privacyPublic : strings.closet.privacyPrivate}
        />
      </View>
      <Text
        style={{
          color: colors.secondaryStrong,
          fontSize: typeRamp.footnote.pt,
          lineHeight: typeRamp.footnote.lineHeight,
        }}
      >
        {hint}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.s1,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
});
