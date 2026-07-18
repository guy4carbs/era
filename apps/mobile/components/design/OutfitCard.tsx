/**
 * OutfitCard — one saved outfit in the Design tab grid.
 *
 * A 4:5 collage (composed cover, or a member-thumbnail fallback) over the outfit
 * name, its occasion, and a piece count. Tapping reopens it on the canvas. A
 * selection tick fires on press, matching the closet tile.
 */
import { strings } from '@era/core/strings';
import { layout, radii, spacing } from '@era/tokens';
import * as Haptics from 'expo-haptics';
import { StyleSheet, View } from 'react-native';

import { Press } from '@/components/Press';
import { Text } from '@/components/Text';
import { useTheme } from '@/lib/theme';

import { Collage } from './Collage';
import type { OutfitSummary } from './api';

interface OutfitCardProps {
  readonly outfit: OutfitSummary;
  readonly onPress: (outfit: OutfitSummary) => void;
}

export function OutfitCard({ outfit, onPress }: OutfitCardProps) {
  const { colors } = useTheme();

  return (
    <Press
      accessibilityRole="button"
      accessibilityLabel={outfit.name ?? strings.design.newOutfit}
      onPress={() => {
        void Haptics.selectionAsync();
        onPress(outfit);
      }}
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
      <Text numberOfLines={1} variant="caption" size="footnote" color={colors.secondaryStrong}>
        {outfit.occasion
          ? `${outfit.occasion} · ${strings.design.outfitItemCount(outfit.itemCount)}`
          : strings.design.outfitItemCount(outfit.itemCount)}
      </Text>
    </Press>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    gap: spacing.s2,
  },
  cover: {
    width: '100%',
    aspectRatio: layout.itemCard.ratio,
    borderCurve: 'continuous',
    overflow: 'hidden',
  },
});
