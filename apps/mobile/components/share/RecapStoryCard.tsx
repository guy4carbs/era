/**
 * RecapStoryCard — "your month, worn" as a share card.
 *
 * A Georgia-serif "Month YYYY" header, the month's numbers as quiet stat rows, a
 * row of the top-three pieces' cutouts with their wear counts, and the most-worn
 * category + best-value lines. Every value comes straight from the recap model —
 * nothing is invented, and a field the recap didn't return simply isn't drawn.
 * Rendered at 360×640 inside {@link ShareFrame} and captured to 1080×1920.
 */
import { strings } from '@era/core/strings';
import { palette, radii, spacing, typeRamp } from '@era/tokens';
import type { RefObject } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { formatMoney } from '@/components/wear/format';
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

  const best = model.bestCostPerWear;
  const bestValueLine =
    best === null
      ? null
      : strings.wear.recap.bestCostPerWear(
          formatMoney(best.costPerWear),
          byId.get(best.itemId)?.name ?? strings.closet.categoryLabel(best.category),
        );

  return (
    <ShareFrame viewRef={viewRef}>
      <Text style={styles.header}>{strings.wear.recap.monthHeader(model.monthLabel)}</Text>

      <View style={styles.stats}>
        <Text style={styles.statLead}>{strings.wear.recap.totalWears(model.totalWears)}</Text>
        <Text style={styles.statSub}>
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
          <Text style={styles.line}>
            {strings.wear.recap.mostWornCategory(categoryLower(model.mostWornCategory))}
          </Text>
        ) : null}
        {bestValueLine !== null ? <Text style={styles.line}>{bestValueLine}</Text> : null}
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
      <Text style={styles.thumbCount}>{`×${wearCount}`}</Text>
    </View>
  );
}

/** A mid-sentence lowercased category label, as the recap string expects. */
function categoryLower(category: string): string {
  return strings.closet.categoryLabel(category).toLowerCase();
}

const styles = StyleSheet.create({
  header: {
    color: CREAM.text,
    fontFamily: 'Georgia',
    fontSize: typeRamp.largeTitle.pt,
    lineHeight: typeRamp.largeTitle.lineHeight,
    fontWeight: '600',
    textAlign: 'center',
  },
  stats: {
    alignItems: 'center',
    gap: spacing.s1,
  },
  statLead: {
    color: CREAM.text,
    fontSize: typeRamp.title3.pt,
    lineHeight: typeRamp.title3.lineHeight,
    fontWeight: '600',
    textAlign: 'center',
  },
  statSub: {
    color: CREAM.secondaryStrong,
    fontSize: typeRamp.subhead.pt,
    lineHeight: typeRamp.subhead.lineHeight,
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
  thumbCount: {
    color: CREAM.secondaryStrong,
    fontSize: typeRamp.caption.pt,
    lineHeight: typeRamp.caption.lineHeight,
    fontWeight: '600',
  },
  lines: {
    alignItems: 'center',
    gap: spacing.s2,
  },
  line: {
    color: CREAM.secondaryStrong,
    fontSize: typeRamp.subhead.pt,
    lineHeight: typeRamp.subhead.lineHeight,
    textAlign: 'center',
  },
});
