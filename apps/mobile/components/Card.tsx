/**
 * Card — surface container with a soft elevation shadow.
 *
 * `aspect="item"` locks the 4:5 closet-item ratio with the item-card padding.
 * `borderCurve: 'continuous'` gives the iOS squircle corner per spec.
 */
import { layout, radii, rnShadow, sheen } from '@era/tokens';
import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import type { PropsWithChildren } from 'react';

import { useTheme } from '@/lib/theme';

// aspectRatio is width / height; a 4:5 portrait item is 0.8 (RN numeric ratio).
const ITEM_ASPECT = layout.itemCard.ratio;

interface CardProps {
  readonly aspect?: 'item' | 'auto';
  readonly style?: StyleProp<ViewStyle>;
}

export function Card({
  aspect = 'auto',
  style,
  children,
}: PropsWithChildren<CardProps>) {
  const { colors } = useTheme();

  return (
    <View
      style={[
        styles.base,
        rnShadow('e2'),
        {
          backgroundColor: colors.surface,
          borderRadius: radii.card,
          borderColor: colors.hairline,
        },
        aspect === 'item' && {
          aspectRatio: ITEM_ASPECT,
          padding: layout.itemCard.padding,
        },
        style,
      ]}
    >
      {aspect === 'item' ? (
        // Diagonal specular sheen (135°), item-card + primary only per spec.
        <LinearGradient
          colors={[sheen.from, sheen.to]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          pointerEvents="none"
          style={[StyleSheet.absoluteFill, { borderRadius: radii.card }]}
        />
      ) : null}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    borderWidth: StyleSheet.hairlineWidth,
    borderCurve: 'continuous',
    // No overflow:hidden — it would clip the iOS shadow. Children that need
    // clipping (e.g. images) set their own matching borderRadius.
  },
});
