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
import { strings } from '@era/core/strings';
import { layout, spacing } from '@era/tokens';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Link } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PageHeader } from '@/components/PageHeader';
import { ScreenEntrance } from '@/components/ScreenEntrance';
import { Text } from '@/components/Text';
import { localToday } from '@/components/wear/format';
import { FeedPager, FeedProvider, FpsOverlay } from '@/components/feed';
import { PriceDropList, ReceiptImportList } from '@/components/notifications';
import { TodayCard } from '@/components/ovi';
import { useSession } from '@/lib/auth-client';
import { eraFeedEnabled } from '@/lib/feed-flag';
import { useTheme } from '@/lib/theme';

/** Per-day gate: the reveal ritual plays once on the first feed visit of a day. */
const REVEAL_SEEN_KEY = 'era-reveal-seen';

const FEED_EMPTY = strings.feed.empty;

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

/** The flag-off surface — unchanged from before the feed phase. */
function FeedStub() {
  const { colors } = useTheme();
  const { data } = useSession();

  const user = data?.user;
  const greetingName = user ? (user.name ?? user.email.split('@')[0] ?? user.email) : null;
  // A personalized greeting when we know the name; otherwise the tab's calm line.
  const subtitle = greetingName ? `Hello, ${greetingName}` : strings.feed.subtitle;

  // Once-per-day reveal gate. `null` while the stored date hydrates — the ritual
  // holds (renders composed) until we know whether today was already seen, so a
  // slow read never double-plays or flashes an assembly on a returning visit. The
  // era-theme AsyncStorage read/write pattern.
  const [playReveal, setPlayReveal] = useState<boolean | null>(null);

  useEffect(() => {
    let active = true;
    void AsyncStorage.getItem(REVEAL_SEEN_KEY).then((seen) => {
      if (active) setPlayReveal(seen !== localToday());
    });
    return () => {
      active = false;
    };
  }, []);

  // Marked after the reveal settles (play-through or skip), so the day plays once.
  const markRevealSeen = () => {
    void AsyncStorage.setItem(REVEAL_SEEN_KEY, localToday());
  };

  return (
    <ScreenEntrance>
      <SafeAreaView style={[styles.screen, { backgroundColor: colors.bg }]} edges={['top']}>
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <PageHeader title="Feed" subtitle={subtitle} />

          {/* Sections open on the D6 section rhythm (52px). The header's own
              marginBottom sets the tighter header→first-section air (32px). */}
          <View style={styles.sections}>
            {/* Ovi's daily suggestion, staged as the D9 reveal ritual. Plays its
                assembly on the first visit of the day, composed thereafter.
                Held until the per-day gate hydrates so the reveal never mounts
                with a stale (composed) decision it can't take back. Renders
                nothing until it has a look to show. */}
            {playReveal !== null ? (
              <TodayCard playReveal={playReveal} onRevealSettled={markRevealSeen} />
            ) : null}

            {/* Price-drop cards for saved pieces. Quiet — renders nothing when empty. */}
            <PriceDropList />

            {/* Forwarded-receipt drafts landed. Quiet — renders nothing when empty. */}
            <ReceiptImportList />

            <Text variant="body" color={colors.secondary} style={{ textAlign: 'center' }}>
              {FEED_EMPTY}
            </Text>

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
