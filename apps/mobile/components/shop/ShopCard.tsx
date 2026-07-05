/**
 * ShopCard — one shoppable pick in the Shop grid.
 *
 * A quiet-luxury card: an image-forward header (the cutout floats on the theme
 * surface with a 135° specular sheen and an e2 lift), then brand, title, price ·
 * retailer, and — when the ranker gave one — a single honest `WhyLabel`. Two
 * affordances close the loop: a primary "View at {retailer}" (also fired by
 * tapping the image) opens the affiliate link, and an understated ghost
 * "Not for me" dismisses the card. Both are lifted to the screen so the side
 * effects (Linking, haptics, rec-event) live in one place.
 *
 * Fixture image URLs point at placeholder hosts that never resolve, so a
 * LinearGradient sits behind every image as a graceful fallback — the card reads
 * as premium whether or not the photo loads.
 */
import type { RankedProduct } from '@era/core/shop';
import { layout, radii, rnShadow, sheen, spacing, typeRamp } from '@era/tokens';
import { LinearGradient } from 'expo-linear-gradient';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/Button';
import { strings } from '@era/core/strings';
import { useTheme } from '@/lib/theme';

import { formatPrice } from './labels';
import { WhyLabel } from './WhyLabel';

interface ShopCardProps {
  readonly product: RankedProduct;
  /** Open the affiliate link + fire the rec_click (screen owns the side effects). */
  readonly onView: (product: RankedProduct) => void;
  /** Dismiss the pick + fire the rec_dismiss. */
  readonly onDismiss: (product: RankedProduct) => void;
}

export function ShopCard({ product, onView, onDismiss }: ShopCardProps) {
  const { colors } = useTheme();
  const viewLabel = strings.shop.viewAt(product.retailer);

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
      {/* Tapping the image is a click-out, same as the primary button. */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={viewLabel}
        onPress={() => onView(product)}
        style={[styles.imageWrap, { borderRadius: radii.card - spacing.s1 }]}
      >
        <LinearGradient
          colors={[colors.surface, colors.hairline]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
        <Image
          source={{ uri: product.imageUrl }}
          style={StyleSheet.absoluteFill}
          resizeMode="cover"
          accessible={false}
        />
        {/* 135° specular sheen — the premium cue shared with the closet tiles. */}
        <LinearGradient
          colors={[sheen.from, sheen.to]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          pointerEvents="none"
          style={StyleSheet.absoluteFill}
        />
      </Pressable>

      <View style={styles.info}>
        <Text
          numberOfLines={1}
          style={{
            color: colors.secondaryStrong,
            fontSize: typeRamp.footnote.pt,
            lineHeight: typeRamp.footnote.lineHeight,
            fontWeight: '600',
            letterSpacing: 0.4,
          }}
        >
          {product.brand.toUpperCase()}
        </Text>

        <Text
          numberOfLines={2}
          style={{
            color: colors.text,
            fontSize: typeRamp.body.pt,
            lineHeight: typeRamp.body.lineHeight,
          }}
        >
          {product.title}
        </Text>

        <Text
          style={{
            color: colors.text,
            fontSize: typeRamp.subhead.pt,
            lineHeight: typeRamp.subhead.lineHeight,
            fontWeight: '600',
          }}
        >
          {formatPrice(product.price, product.currency)}
          <Text style={{ color: colors.secondaryStrong, fontWeight: '400' }}>
            {`   ${product.retailer}`}
          </Text>
        </Text>

        {product.why ? <WhyLabel why={product.why} /> : null}

        <View style={styles.actions}>
          <Button label={viewLabel} onPress={() => onView(product)} />
          <Button
            label={strings.shop.dismiss}
            variant="ghost"
            onPress={() => onDismiss(product)}
          />
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
