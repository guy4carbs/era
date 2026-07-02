/**
 * Closet tab — everything the user owns, plus the entry to add a piece.
 *
 * Fetches the user's items (re-fetching on focus, so a piece added or confirmed
 * elsewhere shows up on return). Empty shows the warm empty line and a single
 * Add button; a stocked closet shows a 2-column grid of 4:5 cards with a
 * floating Add pill above the tab bar. Cards with unconfirmed tags carry an
 * accent dot and resume the confirm step on tap. Colour and layout come from
 * tokens only.
 */
import { strings } from '@era/core/strings';
import { layout, spacing, typeRamp } from '@era/tokens';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/Button';
import { ItemCard, fetchItems, type ItemWithDisplay } from '@/components/items';
import { useTheme } from '@/lib/theme';

type LoadState = 'loading' | 'ready' | 'error';

// Route files require a default export — expo-router discovers screens this way.
export default function ClosetScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [items, setItems] = useState<readonly ItemWithDisplay[]>([]);
  const [state, setState] = useState<LoadState>('loading');

  const load = useCallback(async () => {
    try {
      setItems(await fetchItems());
      setState('ready');
    } catch {
      setState('error');
    }
  }, []);

  // Re-fetch each time the tab gains focus (e.g. returning from add-item).
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const goAdd = useCallback(() => router.push('/add-item'), [router]);
  const resume = useCallback((id: string) => router.push(`/add-item?item=${id}`), [router]);

  // Float the Add pill above the (non-absolute) tab bar and the home-indicator.
  const pillBottom = layout.tabBarHeight + insets.bottom + spacing.s3;

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: colors.bg }]} edges={['top']}>
      {state === 'loading' ? (
        <View style={styles.centered}>
          <ActivityIndicator color={colors.text} />
        </View>
      ) : state === 'error' ? (
        <View style={styles.centered}>
          <Title>Closet</Title>
          <Text style={centerCopy(colors.secondaryStrong)}>{strings.errors.generic}</Text>
          <Button label={strings.errors.retry} variant="secondary" onPress={load} />
        </View>
      ) : items.length === 0 ? (
        <View style={styles.empty}>
          <Title>Closet</Title>
          <View style={styles.emptyBody}>
            <Text style={centerCopy(colors.secondaryStrong)}>{strings.closet.empty}</Text>
            <Button label={strings.closet.addCta} onPress={goAdd} haptic />
          </View>
        </View>
      ) : (
        <>
          <FlatList
            data={items}
            keyExtractor={(item) => item.id}
            numColumns={2}
            renderItem={({ item }) => <ItemCard item={item} onResume={resume} />}
            ListHeaderComponent={<Title>Closet</Title>}
            columnWrapperStyle={styles.column}
            contentContainerStyle={[
              styles.grid,
              { paddingBottom: pillBottom + layout.touchTarget.ios + spacing.s4 },
            ]}
            showsVerticalScrollIndicator={false}
          />
          <View style={[styles.pill, { bottom: pillBottom }]}>
            <Button label={strings.closet.addCta} onPress={goAdd} haptic />
          </View>
        </>
      )}
    </SafeAreaView>
  );
}

/** The screen title, shared across the empty / error / grid states. */
function Title({ children }: { readonly children: string }) {
  const { colors } = useTheme();
  return (
    <Text
      style={{
        color: colors.text,
        fontSize: typeRamp.title1.pt,
        lineHeight: typeRamp.title1.lineHeight,
        fontWeight: '600',
        marginBottom: spacing.s4,
      }}
    >
      {children}
    </Text>
  );
}

/** Centered secondary copy — the shared style for empty / error lines. */
function centerCopy(color: string) {
  return {
    color,
    fontSize: typeRamp.body.pt,
    lineHeight: typeRamp.body.lineHeight,
    textAlign: 'center' as const,
  };
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.s4,
    paddingHorizontal: spacing.s6,
  },
  empty: {
    flex: 1,
    paddingHorizontal: spacing.s6,
    paddingTop: spacing.s8,
  },
  emptyBody: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.s6,
    paddingBottom: spacing.s16,
  },
  grid: {
    paddingHorizontal: layout.grid.mobileMargin,
    paddingTop: spacing.s8,
    gap: layout.grid.gutter,
  },
  column: {
    gap: layout.grid.gutter,
  },
  pill: {
    position: 'absolute',
    left: spacing.s4,
  },
});
