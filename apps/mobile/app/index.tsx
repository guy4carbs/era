import { spacing, typeRamp } from '@era/tokens';
import { Link, Redirect } from 'expo-router';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/Button';
import { eraAuth, useSession } from '@/lib/auth-client';
import { useTheme } from '@/lib/theme';

// Route files require a default export — expo-router discovers screens this way.
export default function HomeScreen() {
  const { colors } = useTheme();
  const { data, isPending } = useSession();

  if (isPending) {
    return (
      <SafeAreaView style={[styles.centered, { backgroundColor: colors.bg }]}>
        <ActivityIndicator color={colors.text} />
      </SafeAreaView>
    );
  }

  if (!data) {
    return <Redirect href="/sign-in" />;
  }

  const { email, name } = data.user;
  const greetingName = name ?? email.split('@')[0] ?? email;

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: colors.bg }]}>
      <View style={styles.body}>
        <Text
          style={{
            color: colors.text,
            fontSize: typeRamp.title1.pt,
            lineHeight: typeRamp.title1.lineHeight,
            fontWeight: '600',
          }}
        >
          Hello, {greetingName}
        </Text>
        <Text
          style={{
            color: colors.secondary,
            fontSize: typeRamp.body.pt,
            lineHeight: typeRamp.body.lineHeight,
          }}
        >
          {email}
        </Text>
      </View>
      <View style={styles.footer}>
        <Button
          label="Sign out"
          variant="secondary"
          onPress={() => {
            void eraAuth.signOut();
          }}
        />
        <Link
          href="/design-lab"
          style={{ color: colors.secondary, fontSize: typeRamp.footnote.pt }}
        >
          Design lab
        </Link>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    paddingHorizontal: spacing.s6,
    paddingVertical: spacing.s8,
    justifyContent: 'space-between',
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: {
    flex: 1,
    justifyContent: 'center',
    gap: spacing.s2,
  },
  footer: {
    gap: spacing.s3,
    alignItems: 'center',
  },
});
