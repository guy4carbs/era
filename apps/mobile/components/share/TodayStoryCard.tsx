/**
 * TodayStoryCard — the Today's Look reveal (D9) as a share card.
 *
 * Mirrors {@link OutfitStoryCard}: 'Today' in the editorial serif leads, the
 * composed look's garment cutouts collage beneath it on the cream, and Ovi's one
 * italic reveal line closes it. Rendered at the 360×640 logical size inside
 * {@link ShareFrame}; the offscreen host captures it to 1080×1920.
 */
import { palette } from '@era/tokens';
import { strings } from '@era/core/strings';
import type { RefObject } from 'react';
import { StyleSheet, View } from 'react-native';

import { Text } from '@/components/Text';
import { collageImageUrls, type TodayShareInput } from '@/lib/share-collage';

import { ShareFrame } from './ShareFrame';
import { TileCollage } from './TileCollage';
import { useImageReadiness } from './useImageReadiness';

const CREAM = palette.light;

interface TodayStoryCardProps {
  readonly input: TodayShareInput;
  readonly viewRef: RefObject<View | null>;
  readonly onAllImagesLoaded: () => void;
}

export function TodayStoryCard({ input, viewRef, onAllImagesLoaded }: TodayStoryCardProps) {
  const urls = collageImageUrls({ tileUrls: input.cutoutUrls });
  const markLoaded = useImageReadiness(urls.length, onAllImagesLoaded);

  return (
    <ShareFrame viewRef={viewRef}>
      <Text variant="largeTitle" size="title1" color={CREAM.text} style={styles.title}>
        {strings.reveal.title}
      </Text>

      <View style={styles.imagery}>
        {/* Cutouts float on the cream (contain), matching the reveal's look. */}
        <TileCollage urls={urls} contentFit="contain" markLoaded={markLoaded} />
      </View>

      {input.revealLine ? (
        <Text variant="oviAccent" color={CREAM.text} style={styles.line} numberOfLines={3}>
          {input.revealLine}
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
    aspectRatio: 0.8, // 4:5, the reveal stage's editorial ratio
  },
  line: {
    textAlign: 'center',
  },
});
