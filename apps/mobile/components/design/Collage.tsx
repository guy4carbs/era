/**
 * Collage — cover imagery for an outfit or era card.
 *
 * Prefers a single composed cover; with none, it tiles up to four member cutouts
 * (outfit thumbnails, or an era's member-outfit covers) into a 2×2 grid. With no
 * imagery at all it falls back to a plain surface fill. Sized by the caller.
 *
 * The member tiles render through the shared {@link ItemSurface} engine in
 * `interactive:'none'` `fill` mode, so a collage carries the same hairline /
 * sheen / warm-tone / padding treatment as a closet tile — the whole app reads
 * as one material. The tiles are composition, not controls: the CARD they sit in
 * is what presses. The composed-cover path stays a plain cover-cropped image (it
 * is a single finished picture, not a cutout collage).
 */
import { radii, spacing } from '@era/tokens';
import { Image, StyleSheet, View } from 'react-native';

import { ItemSurface } from '@/components/items';

interface CollageProps {
  readonly cover: string | null;
  readonly images: readonly string[];
}

export function Collage({ cover, images }: CollageProps) {
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
    <View style={styles.grid}>
      {tiles.map((uri, index) => (
        <View
          key={`${uri}-${index}`}
          style={[styles.tile, tiles.length === 1 ? styles.single : null]}
        >
          <ItemSurface uri={uri} accessibilityLabel="" interactive="none" fill />
        </View>
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
    // The surface tiles carry their own hairline + rounding; the grid is just a
    // wrapping flex row now (no border/fill of its own — each tile is a card).
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
