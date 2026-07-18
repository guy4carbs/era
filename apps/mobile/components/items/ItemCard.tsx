/**
 * ItemCard — one closet tile in the 2-column grid.
 *
 * A 4:5 image card (iOS squircle via `borderCurve: 'continuous'`) with the
 * item's name captioned beneath. A missing `displayUrl` degrades to a token
 * gradient placeholder rather than a broken image. Items whose tags aren't
 * confirmed yet carry a small accent dot and are tappable to resume the confirm
 * step; confirmed items are inert (no detail route yet). A tap fires a selection
 * haptic and lifts the card with a snappy press scale (a short fade under
 * reduced motion).
 */
import { layout, radii, rnShadow, spacing } from '@era/tokens';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { Image, Pressable, StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue } from 'react-native-reanimated';

import { Text } from '@/components/Text';
import { PRESS_SCALE, animate, useReducedMotionSafe } from '@/lib/motion';
import { useTheme } from '@/lib/theme';

import type { ItemWithDisplay } from './api';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);
const REST_SCALE = 1;
const DOT_SIZE = spacing.s3;

interface ItemCardProps {
  readonly item: ItemWithDisplay;
  /** Called when an unconfirmed item is tapped (resume confirm). */
  readonly onResume: (id: string) => void;
}

export function ItemCard({ item, onResume }: ItemCardProps) {
  const { colors, resolved } = useTheme();
  const reduced = useReducedMotionSafe();
  const scale = useSharedValue(REST_SCALE);

  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const unconfirmed = !item.tagsConfirmed;

  return (
    <View style={styles.tile}>
      <AnimatedPressable
        accessibilityRole={unconfirmed ? 'button' : 'image'}
        accessibilityLabel={item.name}
        accessibilityHint={unconfirmed ? '' : undefined}
        disabled={!unconfirmed}
        onPressIn={() => {
          if (!unconfirmed) return;
          scale.value = animate(PRESS_SCALE, reduced, 'snappy');
        }}
        onPressOut={() => {
          if (!unconfirmed) return;
          scale.value = animate(REST_SCALE, reduced, 'snappy');
        }}
        onPress={() => {
          if (!unconfirmed) return;
          void Haptics.selectionAsync();
          onResume(item.id);
        }}
        style={[
          styles.card,
          rnShadow('e2', resolved),
          {
            aspectRatio: layout.itemCard.ratio,
            borderRadius: radii.card,
            backgroundColor: colors.surface,
            borderColor: colors.hairline,
          },
          animatedStyle,
        ]}
      >
        {item.displayUrl ? (
          <Image
            source={{ uri: item.displayUrl }}
            style={styles.image}
            resizeMode="contain"
            accessible={false}
          />
        ) : (
          <LinearGradient
            colors={[colors.surface, colors.hairline]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.image}
          />
        )}
        {unconfirmed ? (
          <View
            style={[styles.dot, { backgroundColor: colors.accent, borderColor: colors.bg }]}
          />
        ) : null}
      </AnimatedPressable>
      <Text
        variant="caption"
        size="footnote"
        numberOfLines={1}
        color={colors.text}
        style={styles.caption}
      >
        {item.name}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  tile: {
    flex: 1,
    gap: spacing.s2,
  },
  card: {
    width: '100%',
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderCurve: 'continuous',
  },
  image: {
    flex: 1,
    width: '100%',
  },
  dot: {
    position: 'absolute',
    top: spacing.s2,
    right: spacing.s2,
    width: DOT_SIZE,
    height: DOT_SIZE,
    borderRadius: DOT_SIZE / 2,
    borderWidth: StyleSheet.hairlineWidth,
  },
  caption: {
    paddingHorizontal: spacing.s1,
  },
});
