/**
 * ReceiptAddressSettings — the Settings section for the personal receipt address.
 *
 * The transport upgrade of the paste-based receipt import: instead of pasting an
 * order email, the user gets a private forwarding address, adds it to contacts,
 * and forwards store confirmations to it — the pieces land in their closet as
 * drafts. This section reveals, copies, and regenerates that address, mirroring
 * the {@link PriceAlertSettings} precedent (a feature-config block with an
 * explainer, an action, and honest notes).
 *
 * Three server states drive the body:
 *   - dormant (inbound not switched on yet) → the quiet "coming soon" line only.
 *   - active → the address in a selectable row, a privacy note, and a
 *     regenerate action guarded by its consequence caption.
 *   - a read failure → a quiet "Try again" that re-fetches, never a wrong state.
 *
 * Clipboard: `expo-clipboard` isn't a dependency and this task adds none, so the
 * address is a `selectable` Text (long-press → the OS Copy menu) rather than a
 * one-tap Copy button. Regenerating is a hard rotation — the old address dies the
 * instant a new one is minted — so it fires a medium impact haptic and confirms
 * via the screen's toast; a failed rotation surfaces an honest toast and leaves
 * the old address shown.
 */
import { strings } from '@era/core/strings';
import { layout, radii, spacing } from '@era/tokens';
import * as Haptics from 'expo-haptics';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { Text } from '@/components/Text';
import { useTheme } from '@/lib/theme';

import { getReceiptAddress, regenerateReceiptAddress, type ReceiptAddress } from './receipt-address-api';

const copy = strings.settings.receiptAddress;

/** The load states the section renders against: still loading, a read failure, or the server truth. */
type LoadState = 'loading' | 'error' | ReceiptAddress;

interface ReceiptAddressSettingsProps {
  /** Raise a transient confirmation/failure line on the screen's toast. */
  readonly onToast: (message: string) => void;
}

export function ReceiptAddressSettings({ onToast }: ReceiptAddressSettingsProps) {
  const { colors } = useTheme();
  const [state, setState] = useState<LoadState>('loading');
  const [regenerating, setRegenerating] = useState(false);

  useEffect(() => {
    let active = true;
    void load(active, setState);
    return () => {
      active = false;
    };
  }, []);

  async function onRegenerate() {
    if (regenerating) return;
    setRegenerating(true);
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      const next = await regenerateReceiptAddress();
      setState(next);
      onToast(copy.regenerated);
    } catch {
      // The old address is still live and still shown — own the miss honestly.
      onToast(strings.errors.generic);
    } finally {
      setRegenerating(false);
    }
  }

  if (state === 'loading') return null;

  if (state === 'error') {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={strings.errors.retry}
        onPress={() => {
          setState('loading');
          void load(true, setState);
        }}
        style={styles.row}
      >
        <Text variant="caption" size="footnote" color={colors.secondaryStrong}>
          {strings.errors.retry}
        </Text>
      </Pressable>
    );
  }

  // Dormant, or an unexpected empty address — show the quiet "coming soon" line.
  if (state.dormant || !state.address) {
    return (
      <Text variant="caption" size="footnote" color={colors.secondaryStrong}>
        {copy.dormant}
      </Text>
    );
  }

  return (
    <View style={styles.container}>
      <Text variant="caption" size="footnote" color={colors.secondaryStrong}>
        {copy.explain}
      </Text>

      <Text
        variant="caption"
        size="footnote"
        weight={600}
        color={colors.secondaryStrong}
        style={styles.eyebrow}
      >
        {copy.addressLabel}
      </Text>
      <View style={[styles.addressRow, { backgroundColor: colors.surface, borderColor: colors.hairline }]}>
        <Text
          variant="body"
          size="subhead"
          selectable
          accessibilityLabel={state.address}
          color={colors.text}
        >
          {state.address}
        </Text>
      </View>

      <Text variant="caption" size="footnote" color={colors.secondary}>
        {copy.privacyNote}
      </Text>

      <Text variant="caption" size="footnote" color={colors.secondary}>
        {copy.regenerateConsequence}
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={copy.regenerateCta}
        accessibilityState={{ disabled: regenerating, busy: regenerating }}
        disabled={regenerating}
        onPress={() => {
          void onRegenerate();
        }}
        style={styles.row}
      >
        <Text
          variant="ui"
          size="body"
          weight={500}
          color={colors.danger}
          style={{ opacity: regenerating ? 0.5 : 1 }}
        >
          {copy.regenerateCta}
        </Text>
        {regenerating ? <ActivityIndicator color={colors.secondary} /> : null}
      </Pressable>
    </View>
  );
}

/** Fetch the address into state; a read failure resolves to the retryable 'error' state. */
async function load(active: boolean, setState: (s: LoadState) => void): Promise<void> {
  try {
    const next = await getReceiptAddress();
    if (active) setState(next);
  } catch {
    if (active) setState('error');
  }
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.s3,
  },
  eyebrow: {
    textTransform: 'uppercase',
  },
  addressRow: {
    borderRadius: radii.input,
    borderWidth: StyleSheet.hairlineWidth,
    borderCurve: 'continuous',
    paddingVertical: spacing.s3,
    paddingHorizontal: spacing.s4,
  },
  row: {
    minHeight: layout.touchTarget.ios,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
});
