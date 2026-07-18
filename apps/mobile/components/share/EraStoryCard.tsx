/**
 * EraStoryCard — a style era as a share card.
 *
 * The era title leads in the editorial serif; beneath it, up to four member-outfit
 * covers tile into a 2×2 grid, with the season as a footnote caption. Rendered at
 * the 360×640 logical size inside {@link ShareFrame} and captured to 1080×1920.
 */
import { palette } from '@era/tokens';
import type { RefObject } from 'react';
import { StyleSheet, View } from 'react-native';

import { Text } from '@/components/Text';
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
      <Text variant="largeTitle" color={CREAM.text} style={styles.title} numberOfLines={3}>
        {input.title}
      </Text>

      <View style={styles.imagery}>
        <TileCollage urls={urls} contentFit="cover" markLoaded={markLoaded} />
      </View>

      {input.season ? (
        <Text variant="caption" size="footnote" color={CREAM.secondaryStrong} style={styles.season} numberOfLines={1}>
          {input.season}
        </Text>
      ) : null}
    </ShareFrame>
  );
}

const styles = StyleSheet.create({
  title: {
    textAlign: 'center',
  },
  imagery: {
    width: '100%',
    aspectRatio: 1,
  },
  season: {
    letterSpacing: 0.5,
    textAlign: 'center',
    textTransform: 'uppercase',
  },
});
