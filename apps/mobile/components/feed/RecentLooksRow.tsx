/**
 * RecentLooksRow — the solo morning page's editorial row of saved looks
 * (D-FEED, mobile).
 *
 * A horizontal ScrollView of composed outfit cards, newest-first, capped at
 * {@link MAX_LOOKS}. Each card is Item-Engine grammar — the same 4:5 {@link Collage}
 * (composed cover, or a 2×2 member-thumbnail mini-collage) the Design tab lists
 * saved outfits with — and opens that outfit exactly the way the Design tab does
 * (a push to the canvas with `?outfit=`). The section is titled in the D8 editorial
 * register: the Fraunces-Italic label + hairline rule, the closet's section-label
 * treatment.
 *
 * It renders NOTHING when there are no looks — the morning page stays a clean
 * ritual rather than showing an empty row.
 */
import { strings } from '@era/core/strings';
import { layout, radii, spacing } from '@era/tokens';
import { ScrollView, StyleSheet, View } from 'react-native';

import { Press } from '@/components/Press';
import { Text } from '@/components/Text';
import { Collage, type OutfitSummary } from '@/components/design';
import { useTheme } from '@/lib/theme';

/** Newest few looks — a glance back, not the whole archive (that's the Design tab). */
const MAX_LOOKS = 6;
/** The card's fixed width in the horizontal rail — a comfortable 4:5 at a glance. */
const CARD_WIDTH = 132;

interface RecentLooksRowProps {
  readonly outfits: readonly OutfitSummary[];
  readonly onOpen: (outfit: OutfitSummary) => void;
}

export function RecentLooksRow({ outfits, onOpen }: RecentLooksRowProps) {
  const { colors } = useTheme();

  // Zero looks → no row at all (the morning page keeps its calm, no empty text).
  if (outfits.length === 0) return null;

  const looks = outfits.slice(0, MAX_LOOKS);

  return (
    <View>
      {/* The one section label: Fraunces-Italic (oviAccent at its title3 default,
          clearing the serif floor) + a hairline rule filling the row — the closet
          section-marker grammar, D8 editorial register. */}
      <View style={styles.label}>
        <Text variant="oviAccent" color={colors.text}>
          {strings.feed.recentLooks}
        </Text>
        <View style={[styles.rule, { backgroundColor: colors.hairline }]} />
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.rail}
      >
        {looks.map((outfit) => (
          <RecentLookCard key={outfit.id} outfit={outfit} onPress={onOpen} />
        ))}
      </ScrollView>
    </View>
  );
}

interface RecentLookCardProps {
  readonly outfit: OutfitSummary;
  readonly onPress: (outfit: OutfitSummary) => void;
}

/**
 * One saved look in the rail — the same 4:5 Collage the Design tab's OutfitCard
 * uses, at a fixed rail width, with the outfit name beneath in the serif accent.
 */
function RecentLookCard({ outfit, onPress }: RecentLookCardProps) {
  const { colors } = useTheme();

  return (
    <Press
      accessibilityRole="button"
      accessibilityLabel={outfit.name ?? strings.design.newOutfit}
      onPress={() => onPress(outfit)}
      haptic="selection"
      style={styles.card}
    >
      <View style={[styles.cover, { borderRadius: radii.card }]}>
        <Collage cover={outfit.coverUrl} images={outfit.thumbnailUrls} />
      </View>
      {outfit.name ? (
        <Text numberOfLines={1} variant="oviAccent" size="subhead" color={colors.text}>
          {outfit.name}
        </Text>
      ) : null}
    </Press>
  );
}

const styles = StyleSheet.create({
  // The editorial section label: italic word + a 1px hairline running to the edge,
  // vertically centred — the magazine section marker, matching the closet.
  label: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s3,
    marginBottom: spacing.s3,
  },
  rule: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
  },
  rail: {
    gap: layout.grid.gutter,
  },
  card: {
    width: CARD_WIDTH,
    gap: spacing.s2,
  },
  cover: {
    width: '100%',
    aspectRatio: layout.itemCard.ratio,
    borderCurve: 'continuous',
    overflow: 'hidden',
  },
});
