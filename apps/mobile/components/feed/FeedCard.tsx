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
import { glass, layout, radii, spacing, palette } from '@era/tokens';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, View } from 'react-native';

import { Press } from '@/components/Press';
import { Text } from '@/components/Text';
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
  const { colors, resolved } = useTheme();
  const feed = useFeed();

  if (isHidden(slot)) {
    return <PostHiddenCard height={height} />;
  }
  const post = slot;

  return (
    // The page bg IS the mode bg (warm cream in light, warm ink in dark) — never a
    // hard black — so a contain-fit cover letterboxes in Era's own material.
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

      {/* Bottom scrim over the text zone only, so the light chrome clears AA over
          any cover. Ink at the AA-locked busy-tint strength (the same grammar the
          glass scrim uses), tokened — no hex-alpha literal. */}
      <LinearGradient
        colors={['transparent', colors.ink]}
        style={[styles.scrim, { opacity: glass.busyTintOpacity[resolved] }]}
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

// On-image chrome reads light regardless of theme, so the pill is built on the
// white palette token at glass opacities rather than rgba literals: a translucent
// white fill under a white hairline border, both dialed by state. The un-followed
// CTA carries a fill + a near-solid border (it's the primary invitation); the
// followed state drops the fill and softens the border to a quiet outline. Fill
// opacity borrows the light glass tint; the border opacities are the on-image
// hairline weights (strong = the CTA edge, soft = the settled outline).
const PILL_FILL_OPACITY = glass.tintOpacity.light;
const PILL_BORDER_STRONG = 0.7;
const PILL_BORDER_SOFT = glass.busyTintOpacity.light;

function FollowPill({ following, onPress }: FollowPillProps) {
  return (
    <Press
      accessibilityRole="button"
      accessibilityLabel={following ? strings.profile.followingState : strings.profile.followCta}
      accessibilityState={{ selected: following }}
      onPress={onPress}
      style={styles.pill}
    >
      {/* The translucent white fill — present only on the un-followed CTA. */}
      {following ? null : (
        <View
          style={[styles.pillLayer, { backgroundColor: ON_IMAGE, opacity: PILL_FILL_OPACITY }]}
          pointerEvents="none"
        />
      )}
      {/* The white hairline border as its own layer, so its opacity is dialed by
          state WITHOUT dimming the label above it. */}
      <View
        style={[
          styles.pillLayer,
          styles.pillBorder,
          { borderColor: ON_IMAGE, opacity: following ? PILL_BORDER_SOFT : PILL_BORDER_STRONG },
        ]}
        pointerEvents="none"
      />
      <Text variant="ui" weight={following ? 400 : 600} color={ON_IMAGE}>
        {following ? strings.profile.followingState : strings.profile.followCta}
      </Text>
    </Press>
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
    overflow: 'hidden',
  },
  // Fill + border ride as their own absolutely-positioned layers so each carries
  // its own state-dialed opacity without touching the label's.
  pillLayer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: radii.input,
    borderCurve: 'continuous',
  },
  pillBorder: {
    borderWidth: StyleSheet.hairlineWidth,
  },
});
