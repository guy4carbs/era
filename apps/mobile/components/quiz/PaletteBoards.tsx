/**
 * PaletteBoards — the palette step (single-select), rendered as swatch boards
 * instead of photos.
 *
 * Each option (all_neutrals | neutral_pops | full_color) shows a row of colour
 * swatches so the choice reads as a palette, not a word. Swatches are DATA from
 * the ARCHETYPES garment-palette hexes in @era/core/quiz — not UI-chrome tokens,
 * so they intentionally bypass the theme (a garment palette is the same in
 * light and dark mode).
 */
import { ARCHETYPES } from '@era/core/quiz';
import { radii, rnShadow, spacing } from '@era/tokens';
import * as Haptics from 'expo-haptics';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue } from 'react-native-reanimated';

import { Text } from '@/components/Text';
import { PRESS_SCALE, animate, useReducedMotionSafe } from '@/lib/motion';
import { useTheme } from '@/lib/theme';

import type { QuizOption, QuizStep } from './contract';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);
const REST_SCALE = 1;

// Garment-world swatch sets composed from ARCHETYPES palette data.
const NEUTRAL_ANCHORS = [
  ...ARCHETYPES.minimalist.anchorHexes.slice(0, 3),
  ...ARCHETYPES.quiet_luxe.anchorHexes.slice(0, 2),
];

/** Map a palette option to its swatch set, sourced from ARCHETYPES hex data. */
function boardFor(optionId: string): readonly string[] {
  switch (optionId) {
    case 'all_neutrals':
      return NEUTRAL_ANCHORS;
    case 'neutral_pops':
      return [
        ...NEUTRAL_ANCHORS.slice(0, 3),
        ...ARCHETYPES.classic.accentHexes.slice(0, 1),
        ...ARCHETYPES.streetwear.accentHexes.slice(0, 1),
      ];
    case 'full_color':
      return [
        ...ARCHETYPES.eclectic.accentHexes.slice(0, 2),
        ...ARCHETYPES.romantic.accentHexes.slice(0, 1),
        ...ARCHETYPES.streetwear.accentHexes.slice(0, 1),
        ...ARCHETYPES.classic.accentHexes.slice(0, 1),
      ];
    default:
      return NEUTRAL_ANCHORS;
  }
}

interface PaletteBoardsProps {
  readonly step: QuizStep;
  readonly selected: string | undefined;
  readonly onSelect: (optionId: string) => void;
}

export function PaletteBoards({ step, selected, onSelect }: PaletteBoardsProps) {
  return (
    <View style={styles.list}>
      {step.options.map((option) => (
        <PaletteBoard
          key={option.id}
          option={option}
          selected={option.id === selected}
          onSelect={onSelect}
        />
      ))}
    </View>
  );
}

interface PaletteBoardProps {
  readonly option: QuizOption;
  readonly selected: boolean;
  readonly onSelect: (optionId: string) => void;
}

function PaletteBoard({ option, selected, onSelect }: PaletteBoardProps) {
  const { colors, resolved } = useTheme();
  const reduced = useReducedMotionSafe();
  const scale = useSharedValue(REST_SCALE);
  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  const swatches = boardFor(option.id);

  return (
    <AnimatedPressable
      accessibilityRole="button"
      accessibilityLabel={option.label}
      accessibilityState={{ selected }}
      onPressIn={() => {
        scale.value = animate(PRESS_SCALE, reduced, 'snappy');
      }}
      onPressOut={() => {
        scale.value = animate(REST_SCALE, reduced, 'snappy');
      }}
      onPress={() => {
        void Haptics.selectionAsync();
        onSelect(option.id);
      }}
      style={[
        styles.board,
        selected ? rnShadow('e3', resolved) : rnShadow('e2', resolved),
        {
          borderRadius: radii.card,
          backgroundColor: colors.surface,
          borderColor: selected ? colors.accent : colors.hairline,
          borderWidth: selected ? 2 : StyleSheet.hairlineWidth,
        },
        animatedStyle,
      ]}
    >
      <View style={styles.swatchRow}>
        {swatches.map((hex, index) => (
          <View
            key={index}
            style={[
              styles.swatch,
              { backgroundColor: hex, borderColor: colors.hairline },
              index === 0 && styles.swatchLeading,
              index === swatches.length - 1 && styles.swatchTrailing,
            ]}
          />
        ))}
      </View>
      <Text variant="body" color={colors.text}>
        {option.label}
      </Text>
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  list: {
    gap: spacing.s4,
  },
  board: {
    padding: spacing.s4,
    gap: spacing.s3,
    borderCurve: 'continuous',
  },
  swatchRow: {
    flexDirection: 'row',
    height: spacing.s12,
    borderRadius: radii.chip,
    overflow: 'hidden',
  },
  swatch: {
    flex: 1,
  },
  swatchLeading: {
    borderTopLeftRadius: radii.chip,
    borderBottomLeftRadius: radii.chip,
  },
  swatchTrailing: {
    borderTopRightRadius: radii.chip,
    borderBottomRightRadius: radii.chip,
  },
});
