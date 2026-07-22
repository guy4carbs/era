/**
 * Settings — the account + preferences screen, pushed over the tabs from the
 * Closet header. Wires mostly-existing systems: the theme provider (appearance),
 * the closet privacy toggle (profiles.is_private), outbound support + legal
 * links, and the two account-exit actions (sign out, delete account).
 *
 * An unauthenticated visitor is bounced to sign-in — every control here is
 * account-scoped. Colour, type, motion, and copy come from tokens and strings
 * only; the delete flow lives in {@link DeleteAccountSheet}.
 */
import { strings } from '@era/core/strings';
import { layout, spacing } from '@era/tokens';
import { Redirect, Stack, useRouter } from 'expo-router';
import { useCallback, useState, type PropsWithChildren } from 'react';
import { ActivityIndicator, Alert, Linking, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { AvatarSection } from '@/components/settings/AvatarSection';
import { OrdersSettings } from '@/components/settings/OrdersSettings';
import { ShippingAddressSettings } from '@/components/settings/ShippingAddressSettings';
import { SizesSettings } from '@/components/settings/SizesSettings';
import { PrivacyToggle, Toast } from '@/components/closet';
import { PriceAlertSettings } from '@/components/notifications';
import {
  DeleteAccountSheet,
  ReceiptAddressSettings,
  SettingRow,
  ThemeControl,
} from '@/components/settings';
import { checkoutCopy } from '@/components/checkout';
import { ScreenEntrance } from '@/components/ScreenEntrance';
import { Text } from '@/components/Text';
import { eraAuth, useSession } from '@/lib/auth-client';
import { eraCheckoutEnabled } from '@/lib/checkout-flag';
import { eraPlusEnabled } from '@/lib/purchases';
import { eraTryonEnabled } from '@/lib/tryon-flag';
import { forceError, reportingActive } from '@/lib/reporting';
import { useTheme } from '@/lib/theme';

// Placeholder support address — Atlas to confirm the real inbox before launch.
// Kept as a single constant (not scattered copy) so the swap is one edit.
const SUPPORT_EMAIL = 'support@era.style';

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000';

// Route files require a default export — expo-router discovers screens this way.
export default function SettingsScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { data, isPending } = useSession();
  const [deleteOpen, setDeleteOpen] = useState(false);
  // Toast for the receipt-address regenerate confirmation/failure — owned here so
  // it pins to the screen (above the home indicator), mirroring the closet idiom.
  const [toast, setToast] = useState<string | null>(null);

  // Clear the session and return to the sign-in gate. Used by sign-out, by a
  // confirmed deletion, and by a 401 during deletion (session already gone).
  const exitToSignIn = useCallback(async () => {
    await eraAuth.signOut();
    router.replace('/sign-in');
  }, [router]);

  const openLink = useCallback((url: string) => {
    // No in-app browser dep is bundled — hand the URL to the system handler.
    void Linking.openURL(url);
  }, []);

  // Dev-only done-criterion: force an error through the whole reporting pipeline
  // so a build can be verified reaching the tracker. Reaches Sentry when a DSN is
  // set; otherwise the debug reporter (console + in-memory), which is what makes
  // this verifiable today.
  const triggerTestError = useCallback(() => {
    forceError();
    // Dev-only diagnostics (gated behind __DEV__ below), never in a release build,
    // so this stays a native Alert on purpose — it's an engineer-facing confirmation
    // of the reporting pipeline, not user-facing product chrome that needs Era's voice.
    Alert.alert(
      'Test error captured',
      reportingActive
        ? 'Sent to Sentry (a DSN is configured).'
        : 'Sent to the debug reporter — check the console for the "[error-reporter]" line.',
    );
  }, []);

  if (isPending) {
    return (
      <SafeAreaView style={[styles.centered, { backgroundColor: colors.bg }]}>
        <Stack.Screen options={{ headerShown: true, title: strings.settings.title }} />
        <ActivityIndicator color={colors.text} />
      </SafeAreaView>
    );
  }

  if (!data) {
    return <Redirect href="/sign-in" />;
  }

  const email = data.user.email;

  return (
    <View style={[styles.screen, { backgroundColor: colors.bg }]}>
      <Stack.Screen options={{ headerShown: true, title: strings.settings.title }} />

      <ScreenEntrance>
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Section title={strings.settings.appearance}>
          <ThemeControl />
        </Section>

        {/* Era+ — only present when the feature flag is on; dormant builds hide it. */}
        {eraPlusEnabled ? (
          <Section title={strings.plus.paywallTitle}>
            <SettingRow
              label={strings.plus.settingsRowLabel}
              accessibilityHint={strings.plus.settingsRowHint}
              onPress={() => router.push('/paywall')}
            />
          </Section>
        ) : null}

        {/* Try-on avatar — only when the cosmetic flag is on; the section hides
            itself when the surface is off server-side or has no avatar to manage. */}
        {eraTryonEnabled ? <AvatarSection onToast={setToast} /> : null}

        <Section title={strings.settings.privacyTitle}>
          <PrivacyToggle />
        </Section>

        <Section title={strings.settings.priceAlerts.title}>
          <PriceAlertSettings />
        </Section>

        <Section title={strings.settings.receiptAddress.title}>
          <ReceiptAddressSettings onToast={setToast} />
        </Section>

        {/* In-flow checkout — sizes, shipping address, and order history. Only
            present when the cosmetic checkout flag is on; the sections read their
            own server state and the server re-gates every call. */}
        {eraCheckoutEnabled ? (
          <>
            <Section title={checkoutCopy.sizesTitle}>
              <SizesSettings onToast={setToast} />
            </Section>
            <Section title={checkoutCopy.shippingTitle}>
              <ShippingAddressSettings onToast={setToast} />
            </Section>
            <Section title={strings.shop.checkout.ordersTitle}>
              <OrdersSettings />
            </Section>
          </>
        ) : null}

        <Section title={strings.settings.support}>
          <SettingRow
            label={strings.settings.contactSupport}
            trailing="↗"
            onPress={() => openLink(`mailto:${SUPPORT_EMAIL}?subject=Era%20Support`)}
          />
          <SettingRow
            label={strings.settings.privacyPolicy}
            trailing="↗"
            onPress={() => openLink(`${API_URL}/privacy`)}
          />
          <SettingRow
            label={strings.settings.terms}
            trailing="↗"
            onPress={() => openLink(`${API_URL}/terms`)}
          />
        </Section>

        <Section title={strings.settings.account}>
          <SettingRow
            label={strings.settings.signOut}
            onPress={() => {
              void exitToSignIn();
            }}
          />
          <SettingRow
            label={strings.settings.deleteAccount}
            destructive
            accessibilityHint={strings.settings.deleteBody}
            onPress={() => setDeleteOpen(true)}
          />
        </Section>

        {/* Dev-only diagnostics — never shipped in a release build. */}
        {__DEV__ ? (
          <Section title="Debug">
            <SettingRow label="Trigger test error" onPress={triggerTestError} />
          </Section>
        ) : null}
        </ScrollView>
      </ScreenEntrance>

      <DeleteAccountSheet
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        accountEmail={email}
        onDeleted={() => {
          void exitToSignIn();
        }}
        onUnauthorized={() => {
          void exitToSignIn();
        }}
      />

      <Toast message={toast} onHide={() => setToast(null)} bottom={insets.bottom + spacing.s6} />
    </View>
  );
}

/**
 * A titled group of settings rows — a small eyebrow heading over its children.
 * The eyebrow uses the `caption` register (uppercase, tracked, secondaryStrong)
 * to match web's settings section label exactly (closes the D6 eyebrow drift).
 */
function Section({ title, children }: PropsWithChildren<{ readonly title: string }>) {
  const { colors } = useTheme();
  return (
    <View style={styles.section}>
      <Text
        accessibilityRole="header"
        variant="caption"
        color={colors.secondaryStrong}
        style={styles.eyebrow}
      >
        {title}
      </Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    paddingHorizontal: spacing.s6,
    paddingTop: spacing.s6,
    paddingBottom: spacing.s8,
    // Setting groups open on the D6 section rhythm (52px between major sections).
    gap: layout.rhythm.sectionAbovePx,
  },
  section: {
    gap: spacing.s3,
  },
  // The eyebrow register — uppercase caption, matching the settings sub-sections'
  // own eyebrows (AvatarSection / SizesSettings) and web's caption section label.
  eyebrow: {
    textTransform: 'uppercase',
  },
});
