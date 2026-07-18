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
import { spacing, typeRamp } from '@era/tokens';
import { Link } from 'expo-router';
import { ScrollView, StyleSheet, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/Button';
import { ScreenEntrance } from '@/components/ScreenEntrance';
import { Text } from '@/components/Text';
import { FeedPager, FeedProvider, FpsOverlay } from '@/components/feed';
import { PriceDropList, ReceiptImportList } from '@/components/notifications';
import { TodayCard } from '@/components/ovi';
import { eraAuth, useSession } from '@/lib/auth-client';
import { eraFeedEnabled } from '@/lib/feed-flag';
import { useTheme } from '@/lib/theme';

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

  return (
    <ScreenEntrance>
      <SafeAreaView style={[styles.screen, { backgroundColor: colors.bg }]} edges={['top']}>
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <View style={styles.header}>
            <Text variant="largeTitle" size="title1" color={colors.text}>
              Feed
            </Text>
            {greetingName ? (
              <Text variant="body" color={colors.secondary}>
                Hello, {greetingName}
              </Text>
            ) : null}
          </View>

          {/* Ovi's daily suggestion. Renders nothing until it has a look to show. */}
          <TodayCard />

          {/* Price-drop cards for saved pieces. Quiet — renders nothing when empty. */}
          <PriceDropList />

          {/* Forwarded-receipt drafts landed. Quiet — renders nothing when empty. */}
          <ReceiptImportList />

          <Text variant="body" color={colors.secondary} style={{ textAlign: 'center' }}>
            {FEED_EMPTY}
          </Text>

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
    gap: spacing.s6,
    paddingBottom: spacing.s8,
  },
  header: {
    gap: spacing.s2,
  },
  footer: {
    gap: spacing.s3,
    alignItems: 'center',
  },
});
