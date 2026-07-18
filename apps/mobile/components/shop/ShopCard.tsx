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
import { layout, radii, rnShadow, sheen, spacing } from '@era/tokens';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useRef, useState } from 'react';
import { Image, StyleSheet, View } from 'react-native';

import { Button } from '@/components/Button';
import { Press } from '@/components/Press';
import { Text } from '@/components/Text';
import { strings } from '@era/core/strings';
import { useTheme } from '@/lib/theme';

import type { SavedShopProduct } from './api';
import { formatPrice } from './labels';
import { WhyLabel } from './WhyLabel';

/**
 * A card renders either a ranked pick (with its `why`/`whyDetail`) or a saved
 * pick (a leaner ShopProduct slice). The `'whyDetail' in product` narrowing keeps
 * the why affordances ranked-only without a discriminant field.
 */
export type ShopCardProduct = RankedProduct | SavedShopProduct;

interface ShopCardProps {
  readonly product: ShopCardProduct;
  /** Open the affiliate link + fire the rec_click (screen owns the side effects). */
  readonly onView: (product: ShopCardProduct) => void;
  /** Whether this pick is on the wishlist — drives the heart's filled state. */
  readonly isSaved: boolean;
  /** Toggle the wishlist (screen owns the optimistic write + revert). */
  readonly onToggleSave: () => void;
  /**
   * Dismiss the pick + fire the rec_dismiss. Omitted on saved cards — "Not for me"
   * is a ranked-feed gesture, not something you do to your own wishlist.
   */
  readonly onDismiss?: (product: RankedProduct) => void;
  /** Open the why-detail sheet — passed only when the pick carries a `whyDetail`. */
  readonly onOpenWhy?: (product: RankedProduct) => void;
  /**
   * In-flow checkout affordance. When `true` AND `onAddToCart` is set, the card
   * shows an 'Add to cart' PRIMARY with 'View at {retailer}' demoted to secondary.
   * Default/false keeps the card BYTE-IDENTICAL to the affiliate-only layout — the
   * regression bar for every non-allowlisted retailer. The screen owns the add
   * (optimistic cart write + badge bump); the card only shows the brief 'Added'.
   */
  readonly canAddToCart?: boolean;
  /** Add this pick to the cross-store cart (screen owns the write + badge). */
  readonly onAddToCart?: (product: ShopCardProduct) => void;
}

export function ShopCard({
  product,
  onView,
  isSaved,
  onToggleSave,
  onDismiss,
  onOpenWhy,
  canAddToCart = false,
  onAddToCart,
}: ShopCardProps) {
  const { colors, resolved } = useTheme();
  const viewLabel = strings.shop.viewAt(product.retailer);
  const inFlow = canAddToCart && onAddToCart !== undefined;

  // A brief post-add confirmation on the card itself (the badge bump lives on the
  // screen). Times out on its own; cleared on unmount so a fast scroll can't fire
  // setState on a gone card.
  const [justAdded, setJustAdded] = useState(false);
  const addedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (addedTimer.current) clearTimeout(addedTimer.current);
    },
    [],
  );
  const handleAdd = () => {
    void Haptics.selectionAsync();
    onAddToCart?.(product);
    setJustAdded(true);
    if (addedTimer.current) clearTimeout(addedTimer.current);
    addedTimer.current = setTimeout(() => setJustAdded(false), 1600);
  };

  // Ranked picks carry a `why`/`whyDetail`; saved picks don't. Narrow structurally
  // so the why label + detail sheet stay ranked-only, no discriminant needed.
  const ranked = 'whyDetail' in product ? product : null;
  const why = ranked?.why ?? null;
  const canOpenWhy = ranked !== null && ranked.whyDetail !== null && onOpenWhy !== undefined;

  return (
    <View
      style={[
        styles.card,
        rnShadow('e2', resolved),
        {
          backgroundColor: colors.surface,
          borderColor: colors.hairline,
          borderRadius: radii.card,
        },
      ]}
    >
      {/* Tapping the image is a click-out, same as the primary button. */}
      <Press
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
          colors={[sheen.from[resolved], sheen.to]}
          locations={[0, 0.6]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          pointerEvents="none"
          style={StyleSheet.absoluteFill}
        />
      </Press>

      <View style={styles.info}>
        <Text
          numberOfLines={1}
          variant="ui"
          size="footnote"
          weight={600}
          color={colors.secondaryStrong}
          style={{ letterSpacing: 0.4 }}
        >
          {product.brand.toUpperCase()}
        </Text>

        <Text numberOfLines={2} variant="body" color={colors.text}>
          {product.title}
        </Text>

        <Text variant="ui" size="subhead" weight={600} color={colors.text}>
          {formatPrice(product.price, product.currency)}
          <Text variant="ui" size="subhead" weight={400} color={colors.secondaryStrong}>
            {`   ${product.retailer}`}
          </Text>
        </Text>

        {why ? (
          <WhyLabel
            why={why}
            onPress={canOpenWhy && ranked ? () => onOpenWhy?.(ranked) : undefined}
          />
        ) : null}

        {inFlow ? (
          <View style={styles.actions}>
            <Button label={strings.shop.checkout.addToCart} onPress={handleAdd} />
            {justAdded ? (
              <Text
                accessibilityLiveRegion="polite"
                variant="caption"
                size="footnote"
                color={colors.secondaryStrong}
                style={{ textAlign: 'center' }}
              >
                {strings.shop.checkout.addedToCart}
              </Text>
            ) : null}
            <Button label={viewLabel} variant="secondary" onPress={() => onView(product)} />
            <SaveToggle isSaved={isSaved} onToggle={onToggleSave} />
            {ranked && onDismiss ? (
              <Button
                label={strings.shop.dismiss}
                variant="ghost"
                onPress={() => onDismiss(ranked)}
              />
            ) : null}
          </View>
        ) : (
          <View style={styles.actions}>
            <Button label={viewLabel} onPress={() => onView(product)} />
            <SaveToggle isSaved={isSaved} onToggle={onToggleSave} />
            {ranked && onDismiss ? (
              <Button
                label={strings.shop.dismiss}
                variant="ghost"
                onPress={() => onDismiss(ranked)}
              />
            ) : null}
          </View>
        )}
      </View>
    </View>
  );
}

/**
 * The wishlist heart. A quiet full-width toggle in the actions stack (not a
 * floating icon) so it matches the card's button rhythm and stays a clear 44pt
 * target. A filled glyph + "Saved" when on the list, an outline + "Save" when not;
 * the accessible label names the ACTION (save / remove), since a heart alone
 * doesn't say what a tap does. A selection tick fires on every toggle. No motion
 * of its own, so it's reduced-motion-safe by construction.
 */
function SaveToggle({ isSaved, onToggle }: { isSaved: boolean; onToggle: () => void }) {
  const { colors } = useTheme();
  const copy = strings.shop.saved;
  return (
    <Press
      accessibilityRole="button"
      accessibilityState={{ selected: isSaved }}
      accessibilityLabel={isSaved ? copy.removeA11y : copy.saveA11y}
      hitSlop={spacing.s2}
      onPress={() => {
        void Haptics.selectionAsync();
        onToggle();
      }}
      style={[
        styles.saveToggle,
        {
          minHeight: layout.touchTarget.ios,
          borderRadius: radii.input,
          backgroundColor: isSaved ? `${colors.accent}29` : 'transparent',
          borderColor: isSaved ? colors.accent : colors.hairline,
        },
      ]}
    >
      <Text variant="body" color={isSaved ? colors.accent : colors.secondaryStrong}>
        {isSaved ? '♥' : '♡'}
      </Text>
      <Text variant="ui" size="body" weight={600} color={colors.text}>
        {isSaved ? copy.savedState : copy.save}
      </Text>
    </Press>
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
  saveToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.s2,
    paddingHorizontal: spacing.s4,
    borderWidth: StyleSheet.hairlineWidth,
    borderCurve: 'continuous',
  },
});
