/**
 * Collage — cover imagery for an outfit or era card.
 *
 * Prefers a single composed cover; with none, it tiles up to four member images
 * (outfit thumbnails, or an era's member-outfit covers) into a 2×2 grid. With no
 * imagery at all it falls back to a plain surface fill. Sized by the caller.
 */
import { radii, spacing } from '@era/tokens';
import { Image, StyleSheet, View } from 'react-native';

import { useTheme } from '@/lib/theme';

interface CollageProps {
  readonly cover: string | null;
  readonly images: readonly string[];
}

export function Collage({ cover, images }: CollageProps) {
  const { colors } = useTheme();

  if (cover) {
    return (
      <Image
        source={{ uri: cover }}
        style={[styles.fill, { borderRadius: radii.card }]}
        resizeMode="cover"
        accessible={false}
      />
    );
  }

  const tiles = images.slice(0, 4);

  return (
    <View
      style={[
        styles.grid,
        { backgroundColor: colors.surface, borderRadius: radii.card, borderColor: colors.hairline },
      ]}
    >
      {tiles.map((uri, index) => (
        <Image
          key={`${uri}-${index}`}
          source={{ uri }}
          style={[styles.tile, tiles.length === 1 ? styles.single : null]}
          resizeMode="cover"
          accessible={false}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: {
    width: '100%',
    height: '100%',
    borderCurve: 'continuous',
  },
  grid: {
    width: '100%',
    height: '100%',
    flexDirection: 'row',
    flexWrap: 'wrap',
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderCurve: 'continuous',
    padding: spacing.s1,
    gap: spacing.s1,
  },
  tile: {
    width: '48%',
    height: '48%',
  },
  single: {
    width: '100%',
    height: '100%',
  },
});
