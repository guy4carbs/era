import { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { eraAuth } from '@/lib/auth-client';

const cream = '#F7F3EC';
const ink = '#141210';

// The deep-link target that brings the user back into the app after auth.
// Must match app.json's `scheme` and the server's trustedOrigins.
const callbackURL = 'era://';

type Status =
  | { readonly kind: 'idle' }
  | { readonly kind: 'sending' }
  | { readonly kind: 'sent' }
  | { readonly kind: 'error'; readonly message: string };

// Route files require a default export — expo-router discovers screens this way.
export default function SignInScreen() {
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
    <SafeAreaView style={styles.screen}>
      <View style={styles.header}>
        <Text style={styles.title}>Era</Text>
        <Text style={styles.subtitle}>Your wardrobe, styled.</Text>
      </View>

      <View style={styles.form}>
        <TextInput
          style={styles.input}
          placeholder="you@example.com"
          placeholderTextColor="rgba(20,18,16,0.4)"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="email"
          keyboardType="email-address"
          inputMode="email"
          editable={!sending}
        />

        <Pressable
          accessibilityRole="button"
          style={[styles.primary, sending && styles.disabled]}
          disabled={sending}
          onPress={() => {
            void sendMagicLink();
          }}
        >
          {sending ? (
            <ActivityIndicator color={cream} />
          ) : (
            <Text style={styles.primaryLabel}>Send magic link</Text>
          )}
        </Pressable>

        {status.kind === 'sent' && (
          <Text style={styles.hint}>
            Check your email for a sign-in link. In development the link is
            printed to the server console.
          </Text>
        )}
        {status.kind === 'error' && <Text style={styles.error}>{status.message}</Text>}

        <View style={styles.divider}>
          <View style={styles.rule} />
          <Text style={styles.dividerLabel}>or</Text>
          <View style={styles.rule} />
        </View>

        <Pressable
          accessibilityRole="button"
          style={styles.secondary}
          onPress={() => {
            void signInWith('apple');
          }}
        >
          <Text style={styles.secondaryLabel}>Continue with Apple</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          style={styles.secondary}
          onPress={() => {
            void signInWith('google');
          }}
        >
          <Text style={styles.secondaryLabel}>Continue with Google</Text>
        </Pressable>
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
    backgroundColor: cream,
    paddingHorizontal: 24,
    justifyContent: 'center',
    gap: 40,
  },
  header: {
    gap: 8,
  },
  title: {
    color: ink,
    fontSize: 40,
    fontWeight: '700',
  },
  subtitle: {
    color: ink,
    fontSize: 16,
    opacity: 0.6,
  },
  form: {
    gap: 16,
  },
  input: {
    borderColor: ink,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: ink,
  },
  primary: {
    backgroundColor: ink,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
  },
  primaryLabel: {
    color: cream,
    fontSize: 16,
    fontWeight: '600',
  },
  disabled: {
    opacity: 0.6,
  },
  hint: {
    color: ink,
    fontSize: 14,
    opacity: 0.7,
    lineHeight: 20,
  },
  error: {
    color: '#B00020',
    fontSize: 14,
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginVertical: 8,
  },
  rule: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
    backgroundColor: ink,
    opacity: 0.3,
  },
  dividerLabel: {
    color: ink,
    fontSize: 14,
    opacity: 0.5,
  },
  secondary: {
    borderColor: ink,
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
  },
  secondaryLabel: {
    color: ink,
    fontSize: 16,
    fontWeight: '500',
  },
});
