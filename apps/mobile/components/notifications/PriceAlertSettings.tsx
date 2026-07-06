/**
 * PriceAlertSettings — the Settings section that controls price-drop alerts.
 *
 * Reads `GET /api/notifications/preferences` on mount and writes `PUT` on every
 * toggle, optimistically (local state moves first, reverts if the server rejects).
 * Opt-IN by design: preferences default all-off and there is no pre-checked or
 * "recommended" nudge. A master switch gates two channel rows (Email / Push);
 * the channels are disabled until the master is on.
 *
 * The Push toggle additionally drives the dormant token-capture flow
 * ({@link enablePushNotifications}). If the OS permission is refused we revert the
 * toggle to off — without permission a push can't be delivered, so leaving it on
 * would be dishonest. A benign no-op (simulator, missing creds) keeps the
 * preference on; the token capture is simply dormant.
 *
 * Rendered inside a settings `Section`, which supplies the heading — this is the
 * body: the plain opt-in explanation, the three rows, and the saved-only note.
 */
import { strings } from '@era/core/strings';
import { layout, spacing, typeRamp } from '@era/tokens';
import * as Haptics from 'expo-haptics';
import { useEffect, useState } from 'react';
import { StyleSheet, Switch, Text, View } from 'react-native';

import { useTheme } from '@/lib/theme';

import { getPreferences, updatePreferences, type NotificationPreferences } from './api';
import { disablePushNotifications, enablePushNotifications } from './push';

/** The honest default before the server answers (and the fall-back on a read error). */
const ALL_OFF: NotificationPreferences = {
  priceAlertsEnabled: false,
  emailAlerts: false,
  pushAlerts: false,
};

const copy = strings.settings.priceAlerts;

export function PriceAlertSettings() {
  const { colors } = useTheme();
  // null while the initial value loads — the switches stay disabled until then.
  const [prefs, setPrefs] = useState<NotificationPreferences | null>(null);

  useEffect(() => {
    let active = true;
    void getPreferences()
      .then((value) => {
        if (active) setPrefs(value);
      })
      .catch(() => {
        // Default to all-off (the safe opt-out) if the read fails.
        if (active) setPrefs(ALL_OFF);
      });
    return () => {
      active = false;
    };
  }, []);

  // Optimistically apply `next`, PUT it, and revert to `previous` on failure.
  // Returns whether the write landed so the push flow can sequence off it.
  async function commit(
    next: NotificationPreferences,
    previous: NotificationPreferences,
  ): Promise<boolean> {
    setPrefs(next);
    void Haptics.selectionAsync();
    try {
      const stored = await updatePreferences(next);
      setPrefs(stored);
      return true;
    } catch {
      setPrefs(previous);
      return false;
    }
  }

  async function onToggleMaster(value: boolean) {
    if (!prefs) return;
    await commit({ ...prefs, priceAlertsEnabled: value }, prefs);
  }

  async function onToggleEmail(value: boolean) {
    if (!prefs) return;
    await commit({ ...prefs, emailAlerts: value }, prefs);
  }

  async function onTogglePush(value: boolean) {
    if (!prefs) return;
    const previous = prefs;
    const written = await commit({ ...prefs, pushAlerts: value }, previous);
    if (!written) return;

    if (value) {
      // Opt-in: run the (dormant) permission + token capture. Only a refused OS
      // permission means push can't be delivered — revert to off for it. A benign
      // no-op keeps the preference on; capture stays dormant until creds exist.
      const result = await enablePushNotifications();
      if (result.status === 'denied') {
        await commit({ ...previous, pushAlerts: false }, { ...previous, pushAlerts: true });
      }
    } else {
      // Best-effort unregister; failures are swallowed by the push module.
      void disablePushNotifications();
    }
  }

  const loaded = prefs !== null;
  const masterOn = prefs?.priceAlertsEnabled ?? false;

  return (
    <View style={styles.container}>
      <Text
        style={{
          color: colors.secondaryStrong,
          fontSize: typeRamp.footnote.pt,
          lineHeight: typeRamp.footnote.lineHeight,
        }}
      >
        {copy.explain}
      </Text>

      <ToggleRow
        label={copy.toggle}
        value={masterOn}
        disabled={!loaded}
        onValueChange={onToggleMaster}
      />

      <ToggleRow
        label={copy.channelEmail}
        value={prefs?.emailAlerts ?? false}
        // Channels only matter while the master is on.
        disabled={!loaded || !masterOn}
        onValueChange={onToggleEmail}
      />

      <ToggleRow
        label={copy.channelPush}
        value={prefs?.pushAlerts ?? false}
        disabled={!loaded || !masterOn}
        onValueChange={onTogglePush}
      />

      <Text
        style={{
          color: colors.secondaryStrong,
          fontSize: typeRamp.footnote.pt,
          lineHeight: typeRamp.footnote.lineHeight,
        }}
      >
        {copy.savedOnlyNote}
      </Text>
    </View>
  );
}

/**
 * One label + Switch row, styled from tokens to match the closet privacy switch.
 * A disabled row dims its label to `secondary` so a greyed channel reads clearly.
 */
function ToggleRow({
  label,
  value,
  disabled,
  onValueChange,
}: {
  readonly label: string;
  readonly value: boolean;
  readonly disabled: boolean;
  readonly onValueChange: (value: boolean) => void;
}) {
  const { colors } = useTheme();
  return (
    <View style={styles.row}>
      <Text
        style={{
          color: disabled ? colors.secondary : colors.text,
          fontSize: typeRamp.body.pt,
          lineHeight: typeRamp.body.lineHeight,
          fontWeight: '500',
        }}
      >
        {label}
      </Text>
      <Switch
        value={value}
        onValueChange={onValueChange}
        disabled={disabled}
        trackColor={{ true: colors.accent, false: colors.hairline }}
        thumbColor={colors.bg}
        ios_backgroundColor={colors.hairline}
        accessibilityRole="switch"
        accessibilityLabel={label}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.s3,
  },
  row: {
    minHeight: layout.touchTarget.ios,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
});
