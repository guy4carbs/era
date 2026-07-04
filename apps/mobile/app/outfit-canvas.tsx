/**
 * Outfit-canvas route — the full-screen build surface presented over the tabs.
 *
 * expo-router auto-registers this file as `/outfit-canvas`; the root Stack hides
 * headers, so it fills the screen. An optional `outfit` search param reopens an
 * existing outfit for editing; absent, it's a fresh build. The canvas calls
 * owner-scoped endpoints, so an unauthenticated visitor is redirected to sign-in.
 *
 * The stage's pieces use react-native-gesture-handler, which needs a
 * GestureHandlerRootView ancestor. The root layout doesn't provide one (it
 * predates this feature), so we wrap the screen here.
 */
import { Redirect, useLocalSearchParams } from 'expo-router';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaView } from 'react-native-safe-area-context';

import { OutfitCanvas } from '@/components/design';
import { useSession } from '@/lib/auth-client';
import { useTheme } from '@/lib/theme';

// Route files require a default export — expo-router discovers screens this way.
export default function OutfitCanvasRoute() {
  const { colors } = useTheme();
  const { data, isPending } = useSession();
  const params = useLocalSearchParams<{ outfit?: string }>();

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
    <GestureHandlerRootView style={styles.root}>
      <View style={[styles.root, { backgroundColor: colors.bg }]}>
        <OutfitCanvas outfitId={params.outfit} />
      </View>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
