/**
 * Add-a-piece route — a full-screen flow presented over the tabs.
 *
 * expo-router auto-registers this file as `/add-item`; the root Stack hides
 * headers, so it fills the screen. The flow calls owner-scoped item endpoints,
 * so an unauthenticated visitor is redirected to sign-in. An optional `item`
 * search param resumes confirming an already-created (unconfirmed) piece —
 * that's the entry from a closet tile's accent dot.
 *
 * The flow owns its own return navigation (back to the closet on save); this
 * screen adds a Cancel affordance to back out before anything is saved.
 */
import { strings } from '@era/core/strings';
import { spacing } from '@era/tokens';
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/Button';
import { OviLoader } from '@/components/OviLoader';
import { AddItemFlow } from '@/components/items';
import { useSession } from '@/lib/auth-client';
import { useTheme } from '@/lib/theme';

// Route files require a default export — expo-router discovers screens this way.
export default function AddItemRoute() {
  const { colors } = useTheme();
  const router = useRouter();
  const { data, isPending } = useSession();
  const params = useLocalSearchParams<{ item?: string }>();

  if (isPending) {
    return (
      <SafeAreaView style={[styles.centered, { backgroundColor: colors.bg }]}>
        <OviLoader variant="page" />
      </SafeAreaView>
    );
  }

  if (!data) {
    return <Redirect href="/sign-in" />;
  }

  return (
    <SafeAreaView
      style={[styles.screen, { backgroundColor: colors.bg }]}
      edges={['top', 'bottom']}
    >
      <View style={styles.header}>
        <Button
          label={strings.common.cancel}
          variant="ghost"
          onPress={() => router.back()}
        />
      </View>
      <View style={styles.body}>
        <AddItemFlow resumeItemId={params.item} />
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
  header: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
    paddingHorizontal: spacing.s4,
    paddingTop: spacing.s2,
  },
  body: {
    flex: 1,
  },
});
