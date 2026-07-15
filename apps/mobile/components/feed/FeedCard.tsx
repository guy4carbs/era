/**
 * FeedCard — one full-screen page in the pager.
 *
 * A hidden-marker slot renders {@link PostHiddenCard}; otherwise the cover fills
 * the page (expo-image, `contentFit="contain"` over the app background — covers
 * are 4:5 view-shots and cropping would amputate a look), with a bottom scrim
 * (transparent → ink) so the light overlay chrome reads over any photo. Over the
 * scrim: the creator {@link Attribution} bottom-left, a follow pill, and the
 * {@link ActionRail} on the right, its column raised to clear the Ovi FAB.
 *
 * `priority` is `high` for the visible page and `low` for its two neighbours, so
 * the on-screen cover decodes first. The card pulls its actions from
 * {@link useFeed}; the pager owns the swipe + the double-tap heart burst.
 */
import { strings } from '@era/core/strings';
import { layout, radii, spacing, typeRamp, palette } from '@era/tokens';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useTheme } from '@/lib/theme';
import { isHidden, type FeedSlot } from '@/lib/feed-store';

import { ActionRail } from './ActionRail';
import { Attribution } from './Attribution';
import { PostHiddenCard } from './PostHiddenCard';
import { useFeed } from './FeedProvider';

const ON_IMAGE = palette.white;
// The rail's lowest button clears the Ovi FAB (a touchTarget circle floating
// spacing.s3 above the in-flow tab bar) plus a gap.
const RAIL_BOTTOM = spacing.s3 + layout.touchTarget.ios + spacing.s4;

interface FeedCardProps {
  readonly slot: FeedSlot;
  readonly height: number;
  readonly priority: 'high' | 'low';
}

export function FeedCard({ slot, height, priority }: FeedCardProps) {
  const { colors } = useTheme();
  const feed = useFeed();

  if (isHidden(slot)) {
    return <PostHiddenCard height={height} />;
  }
  const post = slot;

  return (
    <View style={[styles.page, { height, backgroundColor: colors.bg }]}>
      {post.coverUrl ? (
        <Image
          source={{ uri: post.coverUrl }}
          style={StyleSheet.absoluteFill}
          contentFit="contain"
          transition={150}
          priority={priority}
          accessible={false}
        />
      ) : null}

      {/* Bottom scrim so the light chrome stays legible over any cover. */}
      <LinearGradient
        colors={['transparent', `${colors.ink}99`]}
        style={styles.scrim}
        pointerEvents="none"
      />

      <View style={styles.bottomLeft}>
        <Attribution creator={post.creator} title={post.title} />
        <FollowPill following={post.viewer.following} onPress={() => feed.toggleFollow(post)} />
      </View>

      <View style={styles.rail}>
        <ActionRail
          post={post}
          onLike={() => feed.toggleLike(post)}
          onSave={() => feed.toggleSave(post)}
          onShopSimilar={() => feed.openShopSimilar(post)}
          onMore={() => feed.openMore(post)}
        />
      </View>
    </View>
  );
}

interface FollowPillProps {
  readonly following: boolean;
  readonly onPress: () => void;
}

function FollowPill({ following, onPress }: FollowPillProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={following ? strings.profile.followingState : strings.profile.followCta}
      accessibilityState={{ selected: following }}
      onPress={onPress}
      style={[styles.pill, following ? styles.pillFollowing : styles.pillFollow]}
    >
      <Text style={[styles.pillLabel, following && styles.pillLabelFollowing]}>
        {following ? strings.profile.followingState : strings.profile.followCta}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  page: {
    width: '100%',
    overflow: 'hidden',
  },
  scrim: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: '45%',
  },
  bottomLeft: {
    position: 'absolute',
    left: spacing.s4,
    // Keep clear of the rail column on the right.
    right: layout.touchTarget.ios + spacing.s8,
    bottom: spacing.s4,
    gap: spacing.s3,
  },
  rail: {
    position: 'absolute',
    right: spacing.s4,
    bottom: RAIL_BOTTOM,
  },
  pill: {
    alignSelf: 'flex-start',
    minHeight: layout.touchTarget.ios,
    paddingHorizontal: spacing.s4,
    justifyContent: 'center',
    borderRadius: radii.input,
    borderCurve: 'continuous',
    borderWidth: StyleSheet.hairlineWidth,
  },
  pillFollow: {
    backgroundColor: 'rgba(255, 255, 255, 0.16)',
    borderColor: 'rgba(255, 255, 255, 0.7)',
  },
  pillFollowing: {
    backgroundColor: 'transparent',
    borderColor: 'rgba(255, 255, 255, 0.4)',
  },
  pillLabel: {
    color: ON_IMAGE,
    fontSize: typeRamp.subhead.pt,
    lineHeight: typeRamp.subhead.lineHeight,
    fontWeight: '600',
  },
  pillLabelFollowing: {
    fontWeight: '400',
  },
});
