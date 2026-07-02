import { Redirect } from 'expo-router';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { eraAuth, useSession } from '@/lib/auth-client';

const cream = '#F7F3EC';
const ink = '#141210';

// Route files require a default export — expo-router discovers screens this way.
export default function HomeScreen() {
  const { data, isPending } = useSession();

  if (isPending) {
    return (
      <SafeAreaView style={styles.centered}>
        <ActivityIndicator color={ink} />
      </SafeAreaView>
    );
  }

  if (!data) {
    return <Redirect href="/sign-in" />;
  }

  const { email, name } = data.user;
  const greetingName = name ?? email.split('@')[0] ?? email;

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.body}>
        <Text style={styles.greeting}>Hello, {greetingName}</Text>
        <Text style={styles.email}>{email}</Text>
      </View>
      <Pressable
        accessibilityRole="button"
        style={styles.signOut}
        onPress={() => {
          void eraAuth.signOut();
        }}
      >
        <Text style={styles.signOutLabel}>Sign out</Text>
      </Pressable>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: cream,
    paddingHorizontal: 24,
    paddingVertical: 32,
    justifyContent: 'space-between',
  },
  centered: {
    flex: 1,
    backgroundColor: cream,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: {
    flex: 1,
    justifyContent: 'center',
    gap: 8,
  },
  greeting: {
    color: ink,
    fontSize: 28,
    fontWeight: '600',
  },
  email: {
    color: ink,
    fontSize: 16,
    opacity: 0.6,
  },
  signOut: {
    borderColor: ink,
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  signOutLabel: {
    color: ink,
    fontSize: 16,
    fontWeight: '500',
  },
});
