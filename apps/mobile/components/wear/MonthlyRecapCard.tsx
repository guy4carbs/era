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
import { Image, StyleSheet, View } from 'react-native';

import { Button } from '@/components/Button';
import { Text } from '@/components/Text';
// Direct file import (not the share barrel) — breaks the share↔wear require
// cycle Metro flagged (share barrel → CollageExportHost → closet barrel →
// ItemDetailSheet → wear barrel → this file → share barrel).
import { useCollageExport } from '@/components/share/CollageExportHost';
import { useTheme } from '@/lib/theme';

import type { WearMonthItem } from './api';
import { formatMoney, monthLabel } from './format';

/** The brand mark on the card — a proper-noun wordmark, not UI copy. */
const WORDMARK = 'Era';

/** Wordmark tracking — web's 0.14em over the subhead size (~15pt), in px. */
const LETTERSPACE = Math.round(typeRamp.subhead.pt * 0.14 * 10) / 10;

interface MonthlyRecapCardProps {
  readonly recap: MonthlyRecap;
  /** The month's items, for resolving a top piece's cutout + name. */
  readonly items: readonly WearMonthItem[];
}

export function MonthlyRecapCard({ recap, items }: MonthlyRecapCardProps) {
  const { colors, resolved } = useTheme();
  const { exportRecap, busy: shareBusy } = useCollageExport();

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

  // Compose the recap as a share-ready 1080×1920 image and open the native sheet.
  // The offscreen host renders the same numbers this card shows — no invented
  // fields — so the shared image reads as a sibling of the on-screen recap. An
  // empty month has nothing honest to share, so the entry point is disabled.
  const onShare = useCallback(() => {
    if (isEmpty) {
      return;
    }
    exportRecap(recap, label, items);
  }, [isEmpty, recap, label, items, exportRecap]);

  return (
    <View
      style={[
        styles.card,
        rnShadow('e2', resolved),
        { backgroundColor: colors.surface, borderColor: colors.hairline },
      ]}
    >
      <View style={styles.header}>
        {/* Quiet letterspaced small-caps mark in accent — matches web's wordmark
            so a shared screenshot reads as a sibling of the web recap. */}
        <Text
          accessibilityRole="text"
          variant="ui"
          size="subhead"
          weight={700}
          color={colors.accent}
          style={{
            letterSpacing: LETTERSPACE,
            textTransform: 'uppercase',
          }}
        >
          {WORDMARK}
        </Text>
        <Text variant="caption" size="footnote" weight={600} color={colors.secondaryStrong}>
          {strings.wear.recap.monthHeader(label)}
        </Text>
      </View>

      <Text accessibilityRole="header" variant="title" size="title1" color={colors.text}>
        {strings.wear.recap.title}
      </Text>

      {isEmpty ? (
        <Text variant="body" color={colors.secondaryStrong}>
          {strings.wear.recap.empty}
        </Text>
      ) : (
        <>
          <View style={styles.metrics}>
            <Text variant="ui" size="title3" weight={600} color={colors.text}>
              {strings.wear.recap.totalWears(recap.totalWears)}
            </Text>
            <Text variant="caption" size="subhead" color={colors.secondaryStrong}>
              {strings.wear.recap.daysDressed(recap.distinctDaysWorn, recap.daysInMonth)}
            </Text>
          </View>

          {recap.topItems.length > 0 ? (
            <View style={styles.topBlock}>
              <Text
                variant="caption"
                size="footnote"
                weight={600}
                color={colors.secondaryStrong}
                style={{ textTransform: 'uppercase' }}
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
        <Text variant="caption" color={colors.secondary} style={{ letterSpacing: 0.5 }}>
          {strings.wear.recap.shareTag}
        </Text>
        <Button
          label={shareBusy ? strings.share.preparing : strings.share.shareMonth}
          variant="secondary"
          haptic
          disabled={isEmpty || shareBusy}
          onPress={onShare}
        />
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
      <Text variant="ui" size="caption" weight={600} color={colors.secondaryStrong}>
        {`×${wearCount}`}
      </Text>
    </View>
  );
}

/** A single secondary recap line (most-worn category / best value). */
function RecapLine({ text }: { readonly text: string }) {
  const { colors } = useTheme();
  return (
    <Text variant="caption" size="subhead" color={colors.secondaryStrong}>
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
    gap: spacing.s4,
    padding: spacing.s6,
    borderRadius: radii.card,
    borderWidth: StyleSheet.hairlineWidth,
    borderCurve: 'continuous',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: spacing.s3,
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
