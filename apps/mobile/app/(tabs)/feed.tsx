/**
 * Feed — the landing tab for a signed-in user.
 *
 * Carries the greeting + sign-out that used to live on the root screen, plus a
 * dev-accessible Design lab link. Empty state until the social feed lands.
 */
import { strings } from '@era/core/strings';
import { spacing, typeRamp } from '@era/tokens';
import { Link } from 'expo-router';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/Button';
import { PriceDropList, ReceiptImportList } from '@/components/notifications';
import { TodayCard } from '@/components/ovi';
import { eraAuth, useSession } from '@/lib/auth-client';
import { useTheme } from '@/lib/theme';

const FEED_EMPTY = strings.feed.empty;

// Route files require a default export — expo-router discovers screens this way.
export default function FeedScreen() {
  const { colors } = useTheme();
  const { data } = useSession();

  const user = data?.user;
  const greetingName = user ? (user.name ?? user.email.split('@')[0] ?? user.email) : null;

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: colors.bg }]} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Text
            style={{
              color: colors.text,
              fontSize: typeRamp.title1.pt,
              lineHeight: typeRamp.title1.lineHeight,
              fontWeight: '600',
            }}
          >
            Feed
          </Text>
          {greetingName ? (
            <Text
              style={{
                color: colors.secondary,
                fontSize: typeRamp.body.pt,
                lineHeight: typeRamp.body.lineHeight,
              }}
            >
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

        <Text
          style={{
            color: colors.secondary,
            fontSize: typeRamp.body.pt,
            lineHeight: typeRamp.body.lineHeight,
            textAlign: 'center',
          }}
        >
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
  );
}

const styles = StyleSheet.create({
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
