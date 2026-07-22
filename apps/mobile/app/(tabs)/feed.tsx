/**
 * Feed — the landing tab for a signed-in user.
 *
 * Flag-gated: with the feed OFF (`EXPO_PUBLIC_ERA_FEED_ENABLED` unset), this is
 * the original stub — the greeting, Ovi's Today card, and the quiet notification
 * lists. With the feed ON, the tab becomes the full-screen swipe pager
 * (`FeedProvider` + `FeedPager`), with the dev/preview FPS meter over it. The flag
 * is cosmetic; the server is authoritative (its routes 404 when its own flag is
 * off), so a mis-set client flag can never actually open the feed.
 */
import { suggestForCloset } from '@era/core/ovi';
import { layout, spacing } from '@era/tokens';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Link, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ScreenEntrance } from '@/components/ScreenEntrance';
import { Text } from '@/components/Text';
import { localToday } from '@/components/wear/format';
import { fetchOutfits, type OutfitSummary } from '@/components/design';
import { FeedPager, FeedProvider, FpsOverlay, RecentLooksRow } from '@/components/feed';
import { fetchItems, toOviItem, type ItemWithDisplay } from '@/components/items';
import { PriceDropList, ReceiptImportList } from '@/components/notifications';
import { OviSuggestion, TodayCard, useOviState } from '@/components/ovi';
import { eraFeedEnabled } from '@/lib/feed-flag';
import { useTheme } from '@/lib/theme';

/** Per-day gate: the reveal ritual plays once on the first feed visit of a day. */
const REVEAL_SEEN_KEY = 'era-reveal-seen';

// Route files require a default export — expo-router discovers screens this way.
export default function FeedScreen() {
  // Cosmetic client gate: render the real pager only when this build opted in.
  if (eraFeedEnabled) {
    return <FeedTab />;
  }
  return <FeedStub />;
}

/** The flag-on surface: the full-screen pager + its sheets + the FPS meter. */
function FeedTab() {
  return (
    <GestureHandlerRootView style={styles.root}>
      <FeedProvider>
        <FeedPager />
        <FpsOverlay />
      </FeedProvider>
    </GestureHandlerRootView>
  );
}

/**
 * The flag-off surface — the calm morning page (D-FEED). The reveal ritual leads
 * (its own 'Today' title carries the page — no header, no empty text), then the
 * editorial 'Recent looks' row, then Ovi's quiet closet whisper, then the two
 * quiet notification lists. Everything but the ritual renders nothing when empty,
 * so a thin closet reads as a single clean ritual, not a stack of empty shells.
 */
function FeedStub() {
  const { colors } = useTheme();
  const router = useRouter();
  const { openOvi } = useOviState();

  // Once-per-day reveal gate. `null` while the stored date hydrates — the ritual
  // holds (renders composed) until we know whether today was already seen, so a
  // slow read never double-plays or flashes an assembly on a returning visit. The
  // era-theme AsyncStorage read/write pattern.
  const [playReveal, setPlayReveal] = useState<boolean | null>(null);

  // The saved looks feeding the Recent-looks row, and the owned items feeding
  // Ovi's closet whisper. Both fetched here; a miss simply leaves them empty so
  // the page degrades to the bare ritual rather than failing.
  const [outfits, setOutfits] = useState<readonly OutfitSummary[]>([]);
  const [items, setItems] = useState<readonly ItemWithDisplay[]>([]);

  useEffect(() => {
    let active = true;
    void AsyncStorage.getItem(REVEAL_SEEN_KEY).then((seen) => {
      if (active) setPlayReveal(seen !== localToday());
    });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    void Promise.all([
      fetchOutfits().catch(() => [] as OutfitSummary[]),
      fetchItems().catch(() => [] as ItemWithDisplay[]),
    ]).then(([nextOutfits, nextItems]) => {
      if (!active) return;
      setOutfits(nextOutfits);
      setItems(nextItems);
    });
    return () => {
      active = false;
    };
  }, []);

  // Marked after the reveal settles (play-through or skip), so the day plays once.
  const markRevealSeen = () => {
    void AsyncStorage.setItem(REVEAL_SEEN_KEY, localToday());
  };

  const openOutfit = useCallback(
    (outfit: OutfitSummary) => router.push(`/outfit-canvas?outfit=${outfit.id}`),
    [router],
  );

  // Ovi's ambient closet whisper — the SAME composer + key the closet screen uses,
  // so a look dismissed there stays dismissed here (shared key = honest shared
  // dismissal). Profile/wear aren't fetched on this page, so we pass them honestly
  // (null profile, no wear history); the composer speaks only when a full look
  // genuinely composes from owned pieces, else null (no strip).
  const closetSuggestion = useMemo(
    () => suggestForCloset(items.map(toOviItem), null, []),
    [items],
  );

  return (
    <ScreenEntrance>
      <SafeAreaView style={[styles.screen, { backgroundColor: colors.bg }]} edges={['top']}>
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          {/* Sections open on the D6 section rhythm (52px). The ritual's own
              'Today' title leads the page — no header stands above it. */}
          <View style={styles.sections}>
            {/* Ovi's daily suggestion, staged as the D9 reveal ritual. Plays its
                assembly on the first visit of the day, composed thereafter.
                Held until the per-day gate hydrates so the reveal never mounts
                with a stale (composed) decision it can't take back. Renders
                nothing until it has a look to show. */}
            {playReveal !== null ? (
              <TodayCard playReveal={playReveal} onRevealSettled={markRevealSeen} />
            ) : null}

            {/* The editorial row of saved looks beneath the ritual. Renders nothing
                when there are no looks — no empty text. */}
            <RecentLooksRow outfits={outfits} onOpen={openOutfit} />

            {/* Ovi's quiet closet whisper — one earned line, or null (no strip). */}
            <OviSuggestion
              suggestion={closetSuggestion}
              onOpen={(s) => openOvi({ intent: s.intent, itemId: s.itemId })}
            />

            {/* Price-drop cards for saved pieces. Quiet — renders nothing when empty. */}
            <PriceDropList />

            {/* Forwarded-receipt drafts landed. Quiet — renders nothing when empty. */}
            <ReceiptImportList />

            <View style={styles.footer}>
              {/* Link carries navigation; Text carries the type (footnote on the ramp). */}
              <Link href="/design-lab">
                <Text variant="ui" size="footnote" color={colors.secondary}>
                  Design lab
                </Text>
              </Link>
            </View>
          </View>
        </ScrollView>
      </SafeAreaView>
    </ScreenEntrance>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  screen: {
    flex: 1,
    paddingHorizontal: spacing.s6,
    paddingTop: spacing.s8,
    paddingBottom: spacing.s4,
  },
  content: {
    paddingBottom: spacing.s8,
  },
  sections: {
    gap: layout.rhythm.sectionAbovePx,
  },
  footer: {
    gap: spacing.s3,
    alignItems: 'center',
  },
});
