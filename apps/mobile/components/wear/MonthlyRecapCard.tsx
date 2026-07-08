/**
 * MonthlyRecapCard — "your month, worn": the screenshot-worthy recap.
 *
 * A self-contained card built entirely from `buildMonthlyRecap` (in
 * `@era/core/wear-stats`): the Era wordmark, the month, total wears, days dressed
 * of the month, the most-worn pieces (cutout thumbnails + counts), the most-worn
 * category, and the best cost-per-wear. It is designed to be screenshotted, so it
 * carries its own frame, brand mark, and footer; the Share action ships a plain
 * text summary via React Native's built-in Share (no view-shot, no new deps).
 *
 * Gorgeous in BOTH themes: every colour is a `useTheme()` role and every metric a
 * token — nothing is hardcoded, so light (warm cream) and dark (warm charcoal)
 * are true peers. An empty month still composes a full card around
 * `strings.wear.recap.empty`, never a blank.
 */
import type { MonthlyRecap } from '@era/core/wear-stats';
import { strings } from '@era/core/strings';
import { radii, rnShadow, spacing, typeRamp } from '@era/tokens';
import { useCallback } from 'react';
import { Image, Share, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/Button';
import { useTheme } from '@/lib/theme';

import type { WearMonthItem } from './api';
import { formatMoney, monthLabel } from './format';

/** The brand mark on the card — a proper-noun wordmark, not UI copy. */
const WORDMARK = 'Era';

interface MonthlyRecapCardProps {
  readonly recap: MonthlyRecap;
  /** The month's items, for resolving a top piece's cutout + name. */
  readonly items: readonly WearMonthItem[];
}

export function MonthlyRecapCard({ recap, items }: MonthlyRecapCardProps) {
  const { colors } = useTheme();

  const byId = new Map(items.map((item) => [item.id, item]));
  const isEmpty = recap.totalWears === 0;
  const label = monthLabel(recap.month);

  const best = recap.bestCostPerWear;
  const bestValueLine =
    best === null
      ? null
      : strings.wear.recap.bestCostPerWear(
          formatMoney(best.costPerWear),
          byId.get(best.itemId)?.name ?? strings.closet.categoryLabel(best.category),
        );

  // A plain-text summary for the share sheet, composed from the same strings the
  // card renders — the visual card is what gets screenshotted; this is the text.
  const onShare = useCallback(() => {
    const lines = isEmpty
      ? [strings.wear.recap.empty]
      : [
          strings.wear.recap.totalWears(recap.totalWears),
          strings.wear.recap.daysDressed(recap.distinctDaysWorn, recap.daysInMonth),
        ];
    const message = [
      `${strings.wear.recap.title} — ${strings.wear.recap.monthHeader(label)}`,
      ...lines,
      strings.wear.recap.shareTag,
    ].join('\n');
    void Share.share({ message }).catch(() => {
      // A dismissed/failed share is a no-op — nothing to surface.
    });
  }, [isEmpty, label, recap.totalWears, recap.distinctDaysWorn, recap.daysInMonth]);

  return (
    <View
      style={[
        styles.card,
        rnShadow('e2'),
        { backgroundColor: colors.surface, borderColor: colors.hairline },
      ]}
    >
      <View style={styles.header}>
        <Text
          accessibilityRole="text"
          style={{
            color: colors.text,
            fontSize: typeRamp.largeTitle.pt,
            lineHeight: typeRamp.largeTitle.lineHeight,
            fontWeight: '700',
          }}
        >
          {WORDMARK}
        </Text>
        <Text
          style={{
            color: colors.accent,
            fontSize: typeRamp.footnote.pt,
            lineHeight: typeRamp.footnote.lineHeight,
            fontWeight: '600',
            textTransform: 'uppercase',
          }}
        >
          {strings.wear.recap.monthHeader(label)}
        </Text>
      </View>

      <Text
        accessibilityRole="header"
        style={{
          color: colors.text,
          fontSize: typeRamp.title1.pt,
          lineHeight: typeRamp.title1.lineHeight,
          fontWeight: '600',
        }}
      >
        {strings.wear.recap.title}
      </Text>

      {isEmpty ? (
        <Text
          style={{
            color: colors.secondaryStrong,
            fontSize: typeRamp.body.pt,
            lineHeight: typeRamp.body.lineHeight,
          }}
        >
          {strings.wear.recap.empty}
        </Text>
      ) : (
        <>
          <View style={styles.metrics}>
            <Text
              style={{
                color: colors.text,
                fontSize: typeRamp.title3.pt,
                lineHeight: typeRamp.title3.lineHeight,
                fontWeight: '600',
              }}
            >
              {strings.wear.recap.totalWears(recap.totalWears)}
            </Text>
            <Text
              style={{
                color: colors.secondaryStrong,
                fontSize: typeRamp.subhead.pt,
                lineHeight: typeRamp.subhead.lineHeight,
              }}
            >
              {strings.wear.recap.daysDressed(recap.distinctDaysWorn, recap.daysInMonth)}
            </Text>
          </View>

          {recap.topItems.length > 0 ? (
            <View style={styles.topBlock}>
              <Text
                style={{
                  color: colors.secondaryStrong,
                  fontSize: typeRamp.footnote.pt,
                  lineHeight: typeRamp.footnote.lineHeight,
                  fontWeight: '600',
                  textTransform: 'uppercase',
                }}
              >
                {strings.wear.recap.topPieces}
              </Text>
              <View style={styles.thumbs}>
                {recap.topItems.map((top) => (
                  <TopThumb key={top.itemId} item={byId.get(top.itemId)} wearCount={top.wearCount} />
                ))}
              </View>
            </View>
          ) : null}

          {recap.mostWornCategory !== null ? (
            <RecapLine text={strings.wear.recap.mostWornCategory(categoryLower(recap.mostWornCategory))} />
          ) : null}

          {bestValueLine !== null ? <RecapLine text={bestValueLine} /> : null}
        </>
      )}

      <View style={styles.footer}>
        <Text
          style={{
            color: colors.secondary,
            fontSize: typeRamp.caption.pt,
            lineHeight: typeRamp.caption.lineHeight,
            letterSpacing: 0.5,
          }}
        >
          {strings.wear.recap.shareTag}
        </Text>
        <Button label={strings.common.share} variant="secondary" haptic onPress={onShare} />
      </View>
    </View>
  );
}

/** One most-worn piece: its cutout (or a quiet placeholder) and a `×N` badge. */
function TopThumb({ item, wearCount }: { readonly item: WearMonthItem | undefined; readonly wearCount: number }) {
  const { colors } = useTheme();
  return (
    <View style={styles.thumbCell}>
      <View style={[styles.thumb, { backgroundColor: colors.bg, borderColor: colors.hairline }]}>
        {item?.imageUrl ? (
          <Image
            source={{ uri: item.imageUrl }}
            style={StyleSheet.absoluteFill}
            resizeMode="contain"
            accessibilityLabel={item.name}
          />
        ) : null}
      </View>
      <Text
        style={{
          color: colors.secondaryStrong,
          fontSize: typeRamp.caption.pt,
          lineHeight: typeRamp.caption.lineHeight,
          fontWeight: '600',
        }}
      >
        {`×${wearCount}`}
      </Text>
    </View>
  );
}

/** A single secondary recap line (most-worn category / best value). */
function RecapLine({ text }: { readonly text: string }) {
  const { colors } = useTheme();
  return (
    <Text
      style={{
        color: colors.secondaryStrong,
        fontSize: typeRamp.subhead.pt,
        lineHeight: typeRamp.subhead.lineHeight,
      }}
    >
      {text}
    </Text>
  );
}

/** A mid-sentence lowercased category label, as the recap string expects. */
function categoryLower(category: string): string {
  return strings.closet.categoryLabel(category).toLowerCase();
}

const styles = StyleSheet.create({
  card: {
    gap: spacing.s3,
    padding: spacing.s6,
    borderRadius: radii.hero,
    borderWidth: StyleSheet.hairlineWidth,
    borderCurve: 'continuous',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  metrics: {
    gap: spacing.s1,
  },
  topBlock: {
    gap: spacing.s2,
  },
  thumbs: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.s3,
  },
  thumbCell: {
    alignItems: 'center',
    gap: spacing.s1,
  },
  thumb: {
    width: spacing.s16,
    height: spacing.s16,
    borderRadius: radii.card,
    borderWidth: StyleSheet.hairlineWidth,
    borderCurve: 'continuous',
    overflow: 'hidden',
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.s3,
    marginTop: spacing.s2,
  },
});
