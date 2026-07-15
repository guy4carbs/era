/**
 * EraStoryCard — a style era as a share card.
 *
 * The era title leads in Georgia serif; beneath it, up to four member-outfit
 * covers tile into a 2×2 grid, with the season as a footnote caption. Rendered at
 * the 360×640 logical size inside {@link ShareFrame} and captured to 1080×1920.
 */
import { palette, typeRamp } from '@era/tokens';
import type { RefObject } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { collageImageUrls, type EraShareInput } from '@/lib/share-collage';

import { ShareFrame } from './ShareFrame';
import { TileCollage } from './TileCollage';
import { useImageReadiness } from './useImageReadiness';

const CREAM = palette.light;

interface EraStoryCardProps {
  readonly input: EraShareInput;
  readonly viewRef: RefObject<View | null>;
  readonly onAllImagesLoaded: () => void;
}

export function EraStoryCard({ input, viewRef, onAllImagesLoaded }: EraStoryCardProps) {
  const urls = collageImageUrls({ coverUrl: input.coverUrl, tileUrls: input.outfitCovers });
  const markLoaded = useImageReadiness(urls.length, onAllImagesLoaded);

  return (
    <ShareFrame viewRef={viewRef}>
      <Text style={styles.title} numberOfLines={3}>
        {input.title}
      </Text>

      <View style={styles.imagery}>
        <TileCollage urls={urls} contentFit="cover" markLoaded={markLoaded} />
      </View>

      {input.season ? (
        <Text style={styles.season} numberOfLines={1}>
          {input.season}
        </Text>
      ) : null}
    </ShareFrame>
  );
}

const styles = StyleSheet.create({
  title: {
    color: CREAM.text,
    fontFamily: 'Georgia',
    fontSize: typeRamp.largeTitle.pt,
    lineHeight: typeRamp.largeTitle.lineHeight,
    fontWeight: '600',
    textAlign: 'center',
  },
  imagery: {
    width: '100%',
    aspectRatio: 1,
  },
  season: {
    color: CREAM.secondaryStrong,
    fontSize: typeRamp.footnote.pt,
    lineHeight: typeRamp.footnote.lineHeight,
    letterSpacing: 0.5,
    textAlign: 'center',
    textTransform: 'uppercase',
  },
});
