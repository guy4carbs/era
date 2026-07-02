/**
 * PaletteBoards — the palette step (single-select), rendered as swatch boards
 * instead of photos.
 *
 * Each option (all_neutrals | neutral_pops | full_color) shows a row of colour
 * swatches so the choice reads as a palette, not a word. Swatches are sourced
 * from the theme's own token colours (mode-aware neutrals, accent, and the
 * semantic hues) so nothing here is a literal design value.
 *
 * NOTE (contract): the handoff calls for swatches drawn from ARCHETYPES hex
 * data. That module's per-archetype hex shape isn't finalized yet, so this uses
 * token colours as a faithful stand-in — swap the `boardFor` source once the
 * ARCHETYPES palette shape lands.
 */
import { radii, rnShadow, spacing, typeRamp } from '@era/tokens';
import * as Haptics from 'expo-haptics';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue } from 'react-native-reanimated';

import { animate, useReducedMotionSafe } from '@/lib/motion';
import { useTheme } from '@/lib/theme';

import type { QuizOption, QuizStep } from './contract';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);
const PRESS_SCALE = 0.98;
const REST_SCALE = 1;

type ThemeColors = ReturnType<typeof useTheme>['colors'];

/** Map a palette option to its swatch set, all sourced from token colours. */
function boardFor(optionId: string, c: ThemeColors): readonly string[] {
  switch (optionId) {
    case 'all_neutrals':
      return [c.bg, c.surface, c.hairline, c.secondaryStrong, c.text];
    case 'neutral_pops':
      return [c.surface, c.hairline, c.secondaryStrong, c.accent, c.text];
    case 'full_color':
      return [c.accent, c.success, c.danger, c.secondaryStrong, c.text];
    default:
      return [c.surface, c.hairline, c.accent, c.secondaryStrong, c.text];
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
  const { colors } = useTheme();
  const reduced = useReducedMotionSafe();
  const scale = useSharedValue(REST_SCALE);
  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  const swatches = boardFor(option.id, colors);

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
        selected ? rnShadow('e3') : rnShadow('e2'),
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
      <Text style={{ color: colors.text, fontSize: typeRamp.body.pt, lineHeight: typeRamp.body.lineHeight }}>
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
