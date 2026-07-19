import { spacing } from '@era/tokens';
import * as Linking from 'expo-linking';
import { Link } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/Button';
import { Text } from '@/components/Text';
import { Input } from '@/components/Input';
import { eraAuth } from '@/lib/auth-client';
import { useTheme } from '@/lib/theme';

// The deep-link target that brings the user back into the app after auth —
// environment-correct, not hardcoded: `era://` in real builds, but
// `exp://<host>:<port>` inside Expo Go (which cannot receive era:// links).
// Both schemes are in the server's trustedOrigins.
const callbackURL = Linking.createURL('');

type Status =
  | { readonly kind: 'idle' }
  | { readonly kind: 'sending' }
  | { readonly kind: 'sent' }
  | { readonly kind: 'error'; readonly message: string };

// Route files require a default export — expo-router discovers screens this way.
export default function SignInScreen() {
  const { colors } = useTheme();
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<Status>({ kind: 'idle' });

  const sending = status.kind === 'sending';

  async function sendMagicLink() {
    const trimmed = email.trim();
    if (trimmed.length === 0) {
      setStatus({ kind: 'error', message: 'Enter your email first.' });
      return;
    }
    setStatus({ kind: 'sending' });
    try {
      await eraAuth.signInMagicLink(trimmed, callbackURL);
      setStatus({ kind: 'sent' });
    } catch (error) {
      setStatus({ kind: 'error', message: messageFor(error) });
    }
  }

  async function signInWith(provider: 'apple' | 'google') {
    setStatus({ kind: 'idle' });
    try {
      await eraAuth.signInSocial(provider, callbackURL);
    } catch (error) {
      setStatus({ kind: 'error', message: messageFor(error) });
    }
  }

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: colors.bg }]}>
      <View style={styles.header}>
        <Text variant="largeTitle" color={colors.text}>
          Era
        </Text>
        <Text variant="body" color={colors.secondary}>
          Your wardrobe, styled.
        </Text>
      </View>

      <View style={styles.form}>
        <Input
          placeholder="you@example.com"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="email"
          keyboardType="email-address"
          inputMode="email"
          editable={!sending}
          error={status.kind === 'error' ? status.message : undefined}
        />

        <Button
          label={sending ? '…' : 'Send magic link'}
          variant="primary"
          disabled={sending}
          onPress={() => {
            void sendMagicLink();
          }}
        />
        {sending ? <ActivityIndicator color={colors.accent} /> : null}

        {status.kind === 'sent' && (
          <Text variant="caption" size="footnote" color={colors.secondary}>
            Check your email for a sign-in link. In development the link is printed
            to the server console.
          </Text>
        )}

        <View style={styles.divider}>
          <View style={[styles.rule, { backgroundColor: colors.hairline }]} />
          <Text variant="caption" size="footnote" color={colors.secondary}>or</Text>
          <View style={[styles.rule, { backgroundColor: colors.hairline }]} />
        </View>

        <Button
          label="Continue with Apple"
          variant="secondary"
          onPress={() => {
            void signInWith('apple');
          }}
        />
        <Button
          label="Continue with Google"
          variant="secondary"
          onPress={() => {
            void signInWith('google');
          }}
        />

        {/* Link carries navigation; Text carries the type (footnote on the ramp). */}
        <Link href="/design-lab">
          <Text variant="ui" size="footnote" color={colors.secondary} style={styles.labLink}>
            Design lab
          </Text>
        </Link>
      </View>
    </SafeAreaView>
  );
}

function messageFor(error: unknown): string {
  return error instanceof Error ? error.message : 'Something went wrong. Try again.';
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    paddingHorizontal: spacing.s6,
    justifyContent: 'center',
    gap: spacing.s8,
  },
  header: {
    gap: spacing.s2,
  },
  form: {
    gap: spacing.s4,
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s3,
    marginVertical: spacing.s2,
  },
  rule: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
  },
  labLink: {
    textAlign: 'center',
  },
});
