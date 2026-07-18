/**
 * RecapStoryCard — "your month, worn" as a share card.
 *
 * An editorial-serif "Month YYYY" header, the month's numbers as quiet stat rows, a
 * row of the top-three pieces' cutouts with their wear counts, and the most-worn
 * category + best-value lines. Every value comes straight from the recap model —
 * nothing is invented, and a field the recap didn't return simply isn't drawn.
 * Rendered at 360×640 inside {@link ShareFrame} and captured to 1080×1920.
 */
import { strings } from '@era/core/strings';
import { palette, radii, spacing } from '@era/tokens';
import type { RefObject } from 'react';
import { StyleSheet, View } from 'react-native';

import { Text } from '@/components/Text';
import { recapThumbUrls, type RecapShareItem, type RecapShareModel } from '@/lib/share-collage';

import { ShareFrame } from './ShareFrame';
import { ShareImage } from './ShareImage';
import { useImageReadiness } from './useImageReadiness';

const CREAM = palette.light;

interface RecapStoryCardProps {
  readonly model: RecapShareModel;
  readonly items: readonly RecapShareItem[];
  readonly viewRef: RefObject<View | null>;
  readonly onAllImagesLoaded: () => void;
}

export function RecapStoryCard({ model, items, viewRef, onAllImagesLoaded }: RecapStoryCardProps) {
  const byId = new Map(items.map((item) => [item.id, item]));
  const markLoaded = useImageReadiness(recapThumbUrls(model.topItems, items).length, onAllImagesLoaded);

  // Cost-per-wear stays OFF the shared image on purpose: a share is a public
  // surface (Era convention: no dollar amounts there), and the recap month feed
  // carries no currency so the number would render unit-less anyway. The in-app
  // MonthlyRecapCard keeps it — that surface is private.
  return (
    <ShareFrame viewRef={viewRef}>
      <Text variant="largeTitle" color={CREAM.text} style={styles.header}>
        {strings.wear.recap.monthHeader(model.monthLabel)}
      </Text>

      <View style={styles.stats}>
        <Text variant="ui" size="title3" weight={600} color={CREAM.text} style={styles.statLead}>
          {strings.wear.recap.totalWears(model.totalWears)}
        </Text>
        <Text variant="caption" size="subhead" color={CREAM.secondaryStrong} style={styles.statSub}>
          {strings.wear.recap.daysDressed(model.distinctDaysWorn, model.daysInMonth)}
        </Text>
      </View>

      {model.topItems.length > 0 ? (
        <View style={styles.thumbs}>
          {model.topItems.map((top) => (
            <TopThumb key={top.itemId} item={byId.get(top.itemId)} wearCount={top.wearCount} markLoaded={markLoaded} />
          ))}
        </View>
      ) : null}

      <View style={styles.lines}>
        {model.mostWornCategory !== null ? (
          <Text variant="caption" size="subhead" color={CREAM.secondaryStrong} style={styles.line}>
            {strings.wear.recap.mostWornCategory(categoryLower(model.mostWornCategory))}
          </Text>
        ) : null}
      </View>
    </ShareFrame>
  );
}

/** One most-worn piece: its cutout (or a quiet placeholder) and a `×N` badge. */
function TopThumb({
  item,
  wearCount,
  markLoaded,
}: {
  readonly item: RecapShareItem | undefined;
  readonly wearCount: number;
  readonly markLoaded: () => void;
}) {
  return (
    <View style={styles.thumbCell}>
      <View style={styles.thumb}>
        {item?.imageUrl ? (
          <ShareImage uri={item.imageUrl} contentFit="contain" style={styles.thumbImage} onSettled={markLoaded} />
        ) : null}
      </View>
      <Text variant="ui" size="caption" weight={600} color={CREAM.secondaryStrong}>
        {`×${wearCount}`}
      </Text>
    </View>
  );
}

/** A mid-sentence lowercased category label, as the recap string expects. */
function categoryLower(category: string): string {
  return strings.closet.categoryLabel(category).toLowerCase();
}

const styles = StyleSheet.create({
  header: {
    textAlign: 'center',
  },
  stats: {
    alignItems: 'center',
    gap: spacing.s1,
  },
  statLead: {
    textAlign: 'center',
  },
  statSub: {
    textAlign: 'center',
  },
  thumbs: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing.s4,
  },
  thumbCell: {
    alignItems: 'center',
    gap: spacing.s1,
  },
  thumb: {
    width: spacing.s16,
    height: spacing.s16,
    borderRadius: radii.card,
    borderCurve: 'continuous',
    backgroundColor: CREAM.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: CREAM.hairline,
    overflow: 'hidden',
  },
  thumbImage: {
    width: '100%',
    height: '100%',
  },
  lines: {
    alignItems: 'center',
    gap: spacing.s2,
  },
  line: {
    textAlign: 'center',
  },
});
