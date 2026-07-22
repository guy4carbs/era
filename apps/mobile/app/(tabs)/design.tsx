/**
 * Design tab — saved outfits and eras, and the door into the outfit canvas.
 *
 * Fetches the caller's outfits + eras on focus (so a look built, edited, or
 * assigned elsewhere is reflected on return). An empty slate shows the warm
 * first-outfit invite with a build CTA; a stocked one shows a 2-up outfit grid
 * above the eras section. Tapping an outfit reopens it on the canvas; the build
 * CTA opens a fresh canvas. Colour, layout, and copy come from tokens + strings.
 */
import { suggestForDesign } from '@era/core/ovi';
import { strings } from '@era/core/strings';
import { layout, spacing } from '@era/tokens';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/Button';
import { FailedLoad } from '@/components/FailedLoad';
import { OviLoader } from '@/components/OviLoader';
import { PageHeader } from '@/components/PageHeader';
import { ScreenEntrance } from '@/components/ScreenEntrance';
import { Text } from '@/components/Text';
import { useTabBarVisibility } from '@/components/TabBarVisibility';
import { Toast } from '@/components/closet';
import {
  createEra,
  EraSection,
  fetchEras,
  fetchOutfits,
  OutfitCard,
  type EraSummary,
  type OutfitSummary,
} from '@/components/design';
import { fetchItems, toOviItem, type ItemWithDisplay } from '@/components/items';
import { OviSuggestion, useOviState } from '@/components/ovi';
import { useTheme } from '@/lib/theme';

type LoadState = 'loading' | 'ready' | 'error';

/** Split a list into fixed-size rows (the last row may be short). */
function chunk<T>(list: readonly T[], size: number): T[][] {
  const rows: T[][] = [];
  for (let i = 0; i < list.length; i += size) {
    rows.push(list.slice(i, i + size));
  }
  return rows;
}

// Route files require a default export — expo-router discovers screens this way.
export default function DesignScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const visibility = useTabBarVisibility();
  const { openOvi } = useOviState();

  const [outfits, setOutfits] = useState<readonly OutfitSummary[]>([]);
  const [eras, setEras] = useState<readonly EraSummary[]>([]);
  const [items, setItems] = useState<readonly ItemWithDisplay[]>([]);
  const [state, setState] = useState<LoadState>('loading');
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      // Items ride along so Ovi's design whisper can confirm a look actually
      // composes before it invites; a miss just leaves the closet empty for the
      // composer (→ null → no strip), never fails the screen.
      const [nextOutfits, nextEras, nextItems] = await Promise.all([
        fetchOutfits(),
        fetchEras(),
        fetchItems().catch(() => [] as ItemWithDisplay[]),
      ]);
      setOutfits(nextOutfits);
      setEras(nextEras);
      setItems(nextItems);
      setState('ready');
    } catch {
      setState('error');
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const openCanvas = useCallback(() => router.push('/outfit-canvas'), [router]);
  const openOutfit = useCallback(
    (outfit: OutfitSummary) => router.push(`/outfit-canvas?outfit=${outfit.id}`),
    [router],
  );

  const onCreateEra = useCallback(async (title: string) => {
    setBusy(true);
    try {
      await createEra(title);
      setEras(await fetchEras());
      setToast(strings.design.eraCreated);
    } catch {
      setToast(strings.errors.generic);
    } finally {
      setBusy(false);
    }
  }, []);

  const rows = useMemo(() => chunk(outfits, layout.grid.mobileColumns), [outfits]);

  // Ovi's ambient design invitation — the open door, but only when the closet can
  // actually deliver a starting point. Profile isn't fetched here, so null.
  const designSuggestion = useMemo(
    () => suggestForDesign(items.map(toOviItem), null),
    [items],
  );

  if (state === 'loading') {
    return (
      <SafeAreaView style={[styles.screen, styles.centered, { backgroundColor: colors.bg }]} edges={['top']}>
        <OviLoader variant="page" />
      </SafeAreaView>
    );
  }

  if (state === 'error') {
    return (
      <SafeAreaView style={[styles.screen, styles.centered, { backgroundColor: colors.bg }]} edges={['top']}>
        <FailedLoad onRetry={load} />
      </SafeAreaView>
    );
  }

  if (outfits.length === 0 && eras.length === 0) {
    return (
      <SafeAreaView style={[styles.screen, { backgroundColor: colors.bg }]} edges={['top']}>
        <View style={styles.empty}>
          <Text
            accessibilityRole="header"
            variant="largeTitle"
            color={colors.text}
            style={{ textAlign: 'center' }}
          >
            {strings.design.tabEmptyTitle}
          </Text>
          <Text variant="body" color={colors.secondaryStrong} style={styles.centerCopy}>
            {strings.design.tabEmptyBody}
          </Text>
          <Button label={strings.design.newOutfit} onPress={openCanvas} haptic />
        </View>
        <Toast message={toast} onHide={() => setToast(null)} bottom={layout.tabBarHeight + spacing.s6} />
      </SafeAreaView>
    );
  }

  return (
    <ScreenEntrance>
      <SafeAreaView style={[styles.screen, { backgroundColor: colors.bg }]} edges={['top']}>
        <Animated.ScrollView
          contentContainerStyle={styles.content}
          onScroll={visibility?.scrollHandler}
          scrollEventThrottle={16}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <PageHeader title="Design" subtitle={strings.design.subtitle} />
          <View style={styles.cta}>
            <Button label={strings.design.newOutfit} onPress={openCanvas} haptic />
          </View>

          {/* Ovi's open invitation, in normal flow between the CTA and the grid —
              null (no strip) unless a starting-point look actually composes. */}
          <View style={styles.suggestion}>
            <OviSuggestion
              suggestion={designSuggestion}
              onOpen={(s) => openOvi({ intent: s.intent, itemId: s.itemId })}
            />
          </View>

          <View style={styles.grid}>
            {rows.map((row, index) => (
              <View key={`row-${index}`} style={styles.row}>
                {row.map((outfit) => (
                  <OutfitCard key={outfit.id} outfit={outfit} onPress={openOutfit} />
                ))}
                {row.length === 1 ? <View style={styles.cell} /> : null}
              </View>
            ))}
          </View>

          {/* The eras section opens on the D6 section rhythm (52px) below the grid. */}
          <View style={styles.section}>
            <EraSection eras={eras} busy={busy} onCreate={onCreateEra} />
          </View>
        </Animated.ScrollView>

        <Toast message={toast} onHide={() => setToast(null)} bottom={layout.tabBarHeight + spacing.s6} />
      </SafeAreaView>
    </ScreenEntrance>
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
    gap: spacing.s4,
    paddingHorizontal: spacing.s6,
  },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.s6,
    paddingHorizontal: spacing.s6,
  },
  content: {
    paddingHorizontal: layout.grid.mobileMargin,
    paddingTop: spacing.s8,
    paddingBottom: layout.tabBarHeight + spacing.s16,
  },
  // The build CTA sits just under the header, above the outfit grid.
  cta: {
    paddingBottom: spacing.s4,
  },
  // The ambient strip sits between the CTA and the grid, with a little air below.
  suggestion: {
    paddingBottom: spacing.s4,
  },
  // The outfit grid: rows share the grid gutter both across and down.
  grid: {
    gap: layout.grid.gutter,
  },
  // Major sections open on the D6 section rhythm below the grid.
  section: {
    marginTop: layout.rhythm.sectionAbovePx,
  },
  row: {
    flexDirection: 'row',
    gap: layout.grid.gutter,
  },
  cell: {
    flex: 1,
  },
  centerCopy: {
    textAlign: 'center',
  },
});
