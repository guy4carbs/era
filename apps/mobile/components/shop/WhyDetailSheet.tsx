/**
 * WhyDetailSheet — Ovi's reasoning for a pick, grounded in the user's own closet.
 *
 * Where the card's `WhyLabel` fits one honest line, this expands it against the
 * SPECIFIC owned pieces behind each signal, so the reasoning is checkable rather
 * than a black box. Rendered ONCE at the screen root (like the filter sheet) and
 * driven by the tapped product — a per-card `GlassSheet` would fill only its cell,
 * not the screen. The screen lifts the open/close: tapping a card's `WhyLabel`
 * hands the product up; closing clears it.
 *
 * The four `whyDetail` facets render in trust order — the positive pulls first
 * (`completesWith`, `fillsGap`, `paletteMatch`), the honest "you may already own
 * this" warning (`similarTo`) LAST so it reads as caution, never a pitch. Each
 * `completesWith`/`similarTo` item shows its closet thumbnail (a quiet fallback
 * tile when the server didn't resolve a cutout URL) beside a finished Ovi line.
 */
import { strings } from '@era/core/strings';
import type { RankedProduct, WhyDetail, WhyItemRef } from '@era/core/shop';
import { radii, spacing, typeRamp } from '@era/tokens';
import { useEffect, useState } from 'react';
import { Image, ScrollView, StyleSheet, Text, View } from 'react-native';

import { GlassSheet } from '@/components/GlassSheet';
import { useTheme } from '@/lib/theme';

interface WhyDetailSheetProps {
  /** The tapped pick, or `null` when the sheet is closed. */
  readonly product: RankedProduct | null;
  readonly onClose: () => void;
}

export function WhyDetailSheet({ product, onClose }: WhyDetailSheetProps) {
  // Retain the last detail through the close animation so the sheet slides down
  // with its content intact instead of popping empty on the way out.
  const [shown, setShown] = useState<WhyDetail | null>(null);
  useEffect(() => {
    if (product?.whyDetail) setShown(product.whyDetail);
  }, [product]);

  return (
    <GlassSheet open={product !== null} onClose={onClose}>
      {shown ? <WhyDetailBody detail={shown} /> : null}
    </GlassSheet>
  );
}

function WhyDetailBody({ detail }: { detail: WhyDetail }) {
  const { colors } = useTheme();
  const { completesWith, fillsGap, similarTo, paletteMatch } = detail;

  return (
    <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
      <Text
        accessibilityRole="header"
        style={{
          color: colors.text,
          fontSize: typeRamp.title3.pt,
          lineHeight: typeRamp.title3.lineHeight,
          fontWeight: '700',
        }}
      >
        {strings.shop.whyDetail.title}
      </Text>

      {completesWith.map((item) => (
        <WhyItemRow
          key={`completes-${item.id}`}
          item={item}
          line={strings.shop.whyDetail.completesWith(item.label)}
        />
      ))}

      {fillsGap ? (
        <Line
          text={strings.shop.whyDetail.fillsGap(
            strings.closet.categoryLabel(fillsGap.category).toLowerCase(),
            fillsGap.ownedCount,
          )}
        />
      ) : null}

      {paletteMatch.length > 0 ? (
        <Line text={strings.shop.whyDetail.paletteMatch(paletteMatch.join(', '))} />
      ) : null}

      {similarTo.map((item) => (
        <WhyItemRow
          key={`similar-${item.id}`}
          item={item}
          line={strings.shop.whyDetail.similarTo(item.label)}
        />
      ))}
    </ScrollView>
  );
}

/** A standalone reasoning line with no owned item behind it (gap / palette). */
function Line({ text }: { text: string }) {
  const { colors } = useTheme();
  return (
    <Text
      style={{
        color: colors.text,
        fontSize: typeRamp.body.pt,
        lineHeight: typeRamp.body.lineHeight,
      }}
    >
      {text}
    </Text>
  );
}

/** A closet thumbnail beside its finished Ovi line. */
function WhyItemRow({ item, line }: { item: WhyItemRef; line: string }) {
  const { colors } = useTheme();
  return (
    <View style={styles.row}>
      <View
        style={[
          styles.thumb,
          {
            backgroundColor: colors.surface,
            borderColor: colors.hairline,
            borderRadius: radii.chip,
          },
        ]}
      >
        {item.imageUrl ? (
          <Image
            source={{ uri: item.imageUrl }}
            style={StyleSheet.absoluteFill}
            resizeMode="cover"
            accessible={false}
          />
        ) : null}
      </View>
      <Text
        style={{
          flex: 1,
          color: colors.text,
          fontSize: typeRamp.body.pt,
          lineHeight: typeRamp.body.lineHeight,
        }}
      >
        {line}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  body: {
    gap: spacing.s4,
    paddingBottom: spacing.s6,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s3,
  },
  thumb: {
    width: spacing.s8,
    height: spacing.s8,
    borderWidth: StyleSheet.hairlineWidth,
    borderCurve: 'continuous',
    overflow: 'hidden',
  },
});
