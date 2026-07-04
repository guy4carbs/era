/**
 * OutfitCard — one saved outfit in the Design tab grid.
 *
 * A 4:5 collage (composed cover, or a member-thumbnail fallback) over the outfit
 * name, its occasion, and a piece count. Tapping reopens it on the canvas. A
 * selection tick fires on press, matching the closet tile.
 */
import { strings } from '@era/core/strings';
import { layout, radii, spacing, typeRamp } from '@era/tokens';
import * as Haptics from 'expo-haptics';
import { Pressable, StyleSheet, Text, View } from 'react-native';

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
    <Pressable
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
        <Text
          numberOfLines={1}
          style={{
            color: colors.text,
            fontSize: typeRamp.subhead.pt,
            lineHeight: typeRamp.subhead.lineHeight,
            fontWeight: '600',
          }}
        >
          {outfit.name}
        </Text>
      ) : null}
      <Text
        numberOfLines={1}
        style={{
          color: colors.secondaryStrong,
          fontSize: typeRamp.footnote.pt,
          lineHeight: typeRamp.footnote.lineHeight,
        }}
      >
        {outfit.occasion
          ? `${outfit.occasion} · ${strings.design.outfitItemCount(outfit.itemCount)}`
          : strings.design.outfitItemCount(outfit.itemCount)}
      </Text>
    </Pressable>
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
