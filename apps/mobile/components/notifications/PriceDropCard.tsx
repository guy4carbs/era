/**
 * PriceDropCard — the in-app "price dropped" card for a saved piece.
 *
 * A quiet heads-up, not a banner: the saved piece's image, then the "Price
 * dropped" heading, one plain old→new line, and two ways forward — a primary
 * "Take a look" that clicks out to the retailer, and a ghost "Dismiss". No
 * urgency, no countdown; every surface here is easy to skip, per the price-alert
 * copy contract ({@link strings.shop.priceAlerts.card}).
 *
 * Side effects (Linking, haptics, mark-read) are lifted to the list so they live
 * in one place — this card only calls `onView` / `onDismiss`. Prices arrive in
 * cents on the payload; `formatPrice` renders them (dividing to major units).
 *
 * Like the Shop cards, the image sits over a LinearGradient fallback so the card
 * reads as premium whether or not the photo resolves.
 */
import { strings } from '@era/core/strings';
import { layout, radii, rnShadow, sheen, spacing, typeRamp } from '@era/tokens';
import { LinearGradient } from 'expo-linear-gradient';
import { Image, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/Button';
import { formatPrice } from '@/components/shop';
import { useTheme } from '@/lib/theme';

import type { InAppNotification } from './api';

const card = strings.shop.priceAlerts.card;

interface PriceDropCardProps {
  readonly notification: InAppNotification;
  /** Click out to the retailer (list owns Linking + mark-read). */
  readonly onView: (notification: InAppNotification) => void;
  /** Clear the card without clicking out (list owns mark-read). */
  readonly onDismiss: (notification: InAppNotification) => void;
}

export function PriceDropCard({ notification, onView, onDismiss }: PriceDropCardProps) {
  const { colors } = useTheme();
  const { payload } = notification;

  // Cents → major units for the shared price formatter (fixtures are whole).
  const oldPrice = formatPrice(payload.oldPriceCents / 100, payload.currency);
  const newPrice = formatPrice(payload.newPriceCents / 100, payload.currency);

  return (
    <View
      style={[
        styles.card,
        rnShadow('e2'),
        {
          backgroundColor: colors.surface,
          borderColor: colors.hairline,
          borderRadius: radii.card,
        },
      ]}
    >
      <View style={[styles.imageWrap, { borderRadius: radii.card - spacing.s1 }]}>
        <LinearGradient
          colors={[colors.surface, colors.hairline]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
        <Image
          source={{ uri: payload.imageUrl }}
          style={StyleSheet.absoluteFill}
          resizeMode="cover"
          accessible={false}
        />
        {/* 135° specular sheen — the premium cue shared with the shop + closet tiles. */}
        <LinearGradient
          colors={[sheen.from, sheen.to]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          pointerEvents="none"
          style={StyleSheet.absoluteFill}
        />
      </View>

      <View style={styles.info}>
        <Text
          accessibilityRole="header"
          style={{
            color: colors.secondaryStrong,
            fontSize: typeRamp.footnote.pt,
            lineHeight: typeRamp.footnote.lineHeight,
            fontWeight: '600',
            letterSpacing: 0.4,
            textTransform: 'uppercase',
          }}
        >
          {card.title}
        </Text>

        <Text
          style={{
            color: colors.text,
            fontSize: typeRamp.body.pt,
            lineHeight: typeRamp.body.lineHeight,
          }}
        >
          {card.body(payload.title, oldPrice, newPrice)}
        </Text>

        <View style={styles.actions}>
          <Button label={card.view} onPress={() => onView(notification)} />
          <Button label={card.dismiss} variant="ghost" onPress={() => onDismiss(notification)} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: StyleSheet.hairlineWidth,
    borderCurve: 'continuous',
    overflow: 'hidden',
  },
  imageWrap: {
    width: '100%',
    aspectRatio: layout.itemCard.ratio,
    overflow: 'hidden',
    borderCurve: 'continuous',
  },
  info: {
    padding: layout.itemCard.padding,
    gap: spacing.s2,
  },
  actions: {
    marginTop: spacing.s1,
    gap: spacing.s2,
  },
});
