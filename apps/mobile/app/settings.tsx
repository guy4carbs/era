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
import { spacing, typeRamp } from '@era/tokens';
import { Redirect, Stack, useRouter } from 'expo-router';
import { useCallback, useState, type PropsWithChildren } from 'react';
import { ActivityIndicator, Linking, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PrivacyToggle } from '@/components/closet';
import { DeleteAccountSheet, SettingRow, ThemeControl } from '@/components/settings';
import { eraAuth, useSession } from '@/lib/auth-client';
import { useTheme } from '@/lib/theme';

// Placeholder support address — Atlas to confirm the real inbox before launch.
// Kept as a single constant (not scattered copy) so the swap is one edit.
const SUPPORT_EMAIL = 'support@era.style';

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000';

// Route files require a default export — expo-router discovers screens this way.
export default function SettingsScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const { data, isPending } = useSession();
  const [deleteOpen, setDeleteOpen] = useState(false);

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

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Section title={strings.settings.appearance}>
          <ThemeControl />
        </Section>

        <Section title={strings.settings.privacyTitle}>
          <PrivacyToggle />
        </Section>

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
      </ScrollView>

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
    </View>
  );
}

/** A titled group of settings rows — a small heading over its children. */
function Section({ title, children }: PropsWithChildren<{ readonly title: string }>) {
  const { colors } = useTheme();
  return (
    <View style={styles.section}>
      <Text
        accessibilityRole="header"
        style={{
          color: colors.secondaryStrong,
          fontSize: typeRamp.footnote.pt,
          lineHeight: typeRamp.footnote.lineHeight,
          fontWeight: '600',
          textTransform: 'uppercase',
        }}
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
    gap: spacing.s8,
  },
  section: {
    gap: spacing.s3,
  },
});
