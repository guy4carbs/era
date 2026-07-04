/**
 * Style-quiz route — a full-screen flow presented over the tabs.
 *
 * expo-router auto-registers this file as `/quiz`; the root Stack already hides
 * headers, so it fills the screen. The quiz derives a profile through an
 * authenticated endpoint, so an unauthenticated visitor is redirected to
 * sign-in. Skipping and finishing both land the user on the feed.
 */
import { Redirect, useRouter } from 'expo-router';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { QuizFlow } from '@/components/quiz';
import { useSession } from '@/lib/auth-client';
import { useTheme } from '@/lib/theme';

// Route files require a default export — expo-router discovers screens this way.
export default function QuizRoute() {
  const { colors } = useTheme();
  const router = useRouter();
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

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: colors.bg }]} edges={['top', 'bottom']}>
      <View style={styles.body}>
        <QuizFlow onExit={() => router.replace('/(tabs)/feed')} />
      </View>
    </SafeAreaView>
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
  body: {
    flex: 1,
  },
});
