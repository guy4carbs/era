/**
 * TileCollage — the garment-imagery block of a share card.
 *
 * One image fills the block; two-to-four tile into a 2×2 grid with hairline gaps.
 * `contentFit` is the caller's: `contain` floats transparent cutouts on the cream,
 * `cover` fills photographic outfit covers. Each tile reports through `markLoaded`
 * so the readiness gate can wait on the whole block. Fills its parent — the
 * template sizes the box (e.g. a 4:5 aspect frame).
 */
import { radii } from '@era/tokens';
import { StyleSheet, View } from 'react-native';

import { ShareImage } from './ShareImage';

interface TileCollageProps {
  readonly urls: readonly string[];
  readonly contentFit: 'cover' | 'contain';
  readonly markLoaded: () => void;
}

export function TileCollage({ urls, contentFit, markLoaded }: TileCollageProps) {
  if (urls.length === 0) {
    return null;
  }

  if (urls.length === 1 && urls[0]) {
    return <ShareImage uri={urls[0]} contentFit={contentFit} style={styles.single} onSettled={markLoaded} />;
  }

  return (
    <View style={styles.grid}>
      {urls.map((uri, index) => (
        <ShareImage
          key={`${uri}-${index}`}
          uri={uri}
          contentFit={contentFit}
          style={styles.tile}
          onSettled={markLoaded}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  single: {
    width: '100%',
    height: '100%',
    borderRadius: radii.card,
    borderCurve: 'continuous',
  },
  grid: {
    width: '100%',
    height: '100%',
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    alignContent: 'space-between',
  },
  tile: {
    width: '49%',
    height: '49%',
    borderRadius: radii.card,
    borderCurve: 'continuous',
  },
});
