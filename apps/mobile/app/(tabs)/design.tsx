/**
 * Design tab — saved outfits and eras, and the door into the outfit canvas.
 *
 * Fetches the caller's outfits + eras on focus (so a look built, edited, or
 * assigned elsewhere is reflected on return). An empty slate shows the warm
 * first-outfit invite with a build CTA; a stocked one shows a 2-up outfit grid
 * above the eras section. Tapping an outfit reopens it on the canvas; the build
 * CTA opens a fresh canvas. Colour, layout, and copy come from tokens + strings.
 */
import { strings } from '@era/core/strings';
import { layout, spacing, typeRamp } from '@era/tokens';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/Button';
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

  const [outfits, setOutfits] = useState<readonly OutfitSummary[]>([]);
  const [eras, setEras] = useState<readonly EraSummary[]>([]);
  const [state, setState] = useState<LoadState>('loading');
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [nextOutfits, nextEras] = await Promise.all([fetchOutfits(), fetchEras()]);
      setOutfits(nextOutfits);
      setEras(nextEras);
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

  if (state === 'loading') {
    return (
      <SafeAreaView style={[styles.screen, styles.centered, { backgroundColor: colors.bg }]} edges={['top']}>
        <ActivityIndicator color={colors.text} />
      </SafeAreaView>
    );
  }

  if (state === 'error') {
    return (
      <SafeAreaView style={[styles.screen, styles.centered, { backgroundColor: colors.bg }]} edges={['top']}>
        <Text style={centerCopy(colors.secondaryStrong)}>{strings.errors.generic}</Text>
        <Button label={strings.errors.retry} variant="secondary" onPress={load} />
      </SafeAreaView>
    );
  }

  if (outfits.length === 0 && eras.length === 0) {
    return (
      <SafeAreaView style={[styles.screen, { backgroundColor: colors.bg }]} edges={['top']}>
        <View style={styles.empty}>
          <Text
            accessibilityRole="header"
            style={{
              color: colors.text,
              fontSize: typeRamp.largeTitle.pt,
              lineHeight: typeRamp.largeTitle.lineHeight,
              fontWeight: '700',
              textAlign: 'center',
            }}
          >
            {strings.design.tabEmptyTitle}
          </Text>
          <Text style={centerCopy(colors.secondaryStrong)}>{strings.design.tabEmptyBody}</Text>
          <Button label={strings.design.newOutfit} onPress={openCanvas} haptic />
        </View>
        <Toast message={toast} onHide={() => setToast(null)} bottom={layout.tabBarHeight + spacing.s6} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: colors.bg }]} edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.header}>
          <Text
            accessibilityRole="header"
            style={{
              color: colors.text,
              fontSize: typeRamp.largeTitle.pt,
              lineHeight: typeRamp.largeTitle.lineHeight,
              fontWeight: '700',
            }}
          >
            Design
          </Text>
          <Button label={strings.design.newOutfit} onPress={openCanvas} haptic />
        </View>

        {rows.map((row, index) => (
          <View key={`row-${index}`} style={styles.row}>
            {row.map((outfit) => (
              <OutfitCard key={outfit.id} outfit={outfit} onPress={openOutfit} />
            ))}
            {row.length === 1 ? <View style={styles.cell} /> : null}
          </View>
        ))}

        <EraSection eras={eras} busy={busy} onCreate={onCreateEra} />
      </ScrollView>

      <Toast message={toast} onHide={() => setToast(null)} bottom={layout.tabBarHeight + spacing.s6} />
    </SafeAreaView>
  );
}

/** Centered secondary copy — shared by the empty / error states. */
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
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.s6,
    paddingHorizontal: spacing.s6,
  },
  content: {
    paddingHorizontal: layout.grid.mobileMargin,
    paddingTop: spacing.s8,
    paddingBottom: layout.tabBarHeight + spacing.s16,
    gap: layout.grid.gutter,
  },
  header: {
    gap: spacing.s4,
    paddingBottom: spacing.s4,
  },
  row: {
    flexDirection: 'row',
    gap: layout.grid.gutter,
  },
  cell: {
    flex: 1,
  },
});
