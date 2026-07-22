/**
 * SelectionGlow — the quiz's shared select-time bloom (D-QUIZ).
 *
 * A soft accent halo painted BEHIND a selectable card that ramps base → peak on
 * select (the GlowBloom grammar) and holds while the card's 2px accent border
 * carries the settled selection. One source for every quiz renderer so the bloom
 * reads identically across photo cards, mood cards, palette boards and chips.
 *
 * It fills its positioned parent (absolute), so wrap a card in a relatively-
 * positioned container and drop this in first, the card second. Under reduced
 * motion the opacity jumps to its resting value — no bloom.
 */
import { glow } from '@era/tokens';
import { StyleSheet } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import { useEffect } from 'react';

import { animate, useReducedMotionSafe } from '@/lib/motion';
import { useTheme } from '@/lib/theme';

interface SelectionGlowProps {
  readonly selected: boolean;
  /** Match the wrapped card's corner so the halo tracks its silhouette. */
  readonly radius: number;
}

export function SelectionGlow({ selected, radius }: SelectionGlowProps) {
  const { colors, resolved } = useTheme();
  const reduced = useReducedMotionSafe();
  const opacity = useSharedValue(selected ? glow.opacity[resolved] : 0);

  useEffect(() => {
    const peak = glow.opacity[resolved];
    opacity.value = animate(selected ? peak : 0, reduced, 'gentle');
  }, [selected, reduced, resolved, opacity]);

  const style = useAnimatedStyle(() => ({ opacity: opacity.value }));

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        StyleSheet.absoluteFill,
        style,
        {
          backgroundColor: colors.accent,
          shadowColor: colors.accent,
          shadowRadius: glow.blurRadius,
          shadowOpacity: 1,
          shadowOffset: { width: 0, height: 0 },
          borderRadius: radius,
        },
      ]}
    />
  );
}
