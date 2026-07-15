/**
 * TileCollage — the garment-imagery block of a share card.
 *
 * The layout is COUNT-AWARE so the block is always fully composed — a share
 * image with a dead half reads as broken, not editorial:
 *   1 → full-bleed single
 *   2 → two full-height side-by-side halves
 *   3 → one full-height half + a stacked pair on the right
 *   4 → the 2×2 grid
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
  const [first, second, third, fourth] = urls;

  if (first === undefined) {
    return null;
  }

  if (second === undefined) {
    return <ShareImage uri={first} contentFit={contentFit} style={styles.single} onSettled={markLoaded} />;
  }

  if (third === undefined) {
    // n=2: two full-height halves — no dead bottom half.
    return (
      <View style={styles.row}>
        <ShareImage uri={first} contentFit={contentFit} style={styles.half} onSettled={markLoaded} />
        <ShareImage uri={second} contentFit={contentFit} style={styles.half} onSettled={markLoaded} />
      </View>
    );
  }

  if (fourth === undefined) {
    // n=3: a full-height lead + a stacked pair — every quadrant earns its place.
    return (
      <View style={styles.row}>
        <ShareImage uri={first} contentFit={contentFit} style={styles.half} onSettled={markLoaded} />
        <View style={styles.stack}>
          <ShareImage uri={second} contentFit={contentFit} style={styles.stacked} onSettled={markLoaded} />
          <ShareImage uri={third} contentFit={contentFit} style={styles.stacked} onSettled={markLoaded} />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.grid}>
      {urls.slice(0, 4).map((uri, index) => (
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
  row: {
    width: '100%',
    height: '100%',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  half: {
    width: '49%',
    height: '100%',
    borderRadius: radii.card,
    borderCurve: 'continuous',
  },
  stack: {
    width: '49%',
    height: '100%',
    justifyContent: 'space-between',
  },
  stacked: {
    width: '100%',
    height: '49%',
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
