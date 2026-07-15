/**
 * OutfitStoryCard — a saved look as a share card.
 *
 * The garment imagery leads: a composed cover, or up to four garment cutouts
 * collaged on the cream. The outfit name sits beneath in Georgia serif with the
 * occasion as a footnote caption. Rendered at the 360×640 logical size inside
 * {@link ShareFrame}; the offscreen host captures it to 1080×1920.
 */
import { palette, spacing, typeRamp } from '@era/tokens';
import type { RefObject } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { collageImageUrls, type OutfitShareInput } from '@/lib/share-collage';

import { ShareFrame } from './ShareFrame';
import { TileCollage } from './TileCollage';
import { useImageReadiness } from './useImageReadiness';

const CREAM = palette.light;

interface OutfitStoryCardProps {
  readonly input: OutfitShareInput;
  readonly viewRef: RefObject<View | null>;
  readonly onAllImagesLoaded: () => void;
}

export function OutfitStoryCard({ input, viewRef, onAllImagesLoaded }: OutfitStoryCardProps) {
  const urls = collageImageUrls({ coverUrl: input.coverUrl, tileUrls: input.cutoutUrls });
  const markLoaded = useImageReadiness(urls.length, onAllImagesLoaded);
  const hasCover = Boolean(input.coverUrl?.trim());

  return (
    <ShareFrame viewRef={viewRef}>
      <View style={styles.imagery}>
        <TileCollage urls={urls} contentFit={hasCover ? 'cover' : 'contain'} markLoaded={markLoaded} />
      </View>

      <View style={styles.caption}>
        {input.name ? (
          <Text style={styles.name} numberOfLines={2}>
            {input.name}
          </Text>
        ) : null}
        {input.occasion ? (
          <Text style={styles.occasion} numberOfLines={1}>
            {input.occasion}
          </Text>
        ) : null}
      </View>
    </ShareFrame>
  );
}

const styles = StyleSheet.create({
  imagery: {
    width: '100%',
    aspectRatio: 0.8, // 4:5, the item-card portrait ratio
  },
  caption: {
    alignItems: 'center',
    gap: spacing.s2,
  },
  name: {
    color: CREAM.text,
    fontFamily: 'Georgia',
    fontSize: typeRamp.title1.pt,
    lineHeight: typeRamp.title1.lineHeight,
    fontWeight: '600',
    textAlign: 'center',
  },
  occasion: {
    color: CREAM.secondaryStrong,
    fontSize: typeRamp.footnote.pt,
    lineHeight: typeRamp.footnote.lineHeight,
    textAlign: 'center',
  },
});
