/**
 * TextBands — the budget step (single-select), rendered as full-width text
 * cards.
 *
 * Budget is a plain choice with no imagery, so each option is a wide band with
 * its label. A tap ticks a selection haptic and the flow advances; the selected
 * band blooms the shared accent glow and settles into a 2px accent ring.
 */
import { radii, rnShadow, spacing } from '@era/tokens';
import * as Haptics from 'expo-haptics';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue } from 'react-native-reanimated';

import { Text } from '@/components/Text';
import { PRESS_SCALE, animate, useReducedMotionSafe } from '@/lib/motion';
import { useTheme } from '@/lib/theme';

import { SelectionGlow } from './SelectionGlow';
import type { QuizOption, QuizStep } from './contract';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);
const REST_SCALE = 1;

interface TextBandsProps {
  readonly step: QuizStep;
  readonly selected: string | undefined;
  readonly onSelect: (optionId: string) => void;
}

export function TextBands({ step, selected, onSelect }: TextBandsProps) {
  return (
    <>
      {step.options.map((option) => (
        <TextBand
          key={option.id}
          option={option}
          selected={option.id === selected}
          onSelect={onSelect}
        />
      ))}
    </>
  );
}

interface TextBandProps {
  readonly option: QuizOption;
  readonly selected: boolean;
  readonly onSelect: (optionId: string) => void;
}

function TextBand({ option, selected, onSelect }: TextBandProps) {
  const { colors, resolved } = useTheme();
  const reduced = useReducedMotionSafe();
  const scale = useSharedValue(REST_SCALE);
  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <View style={styles.cell}>
      {/* The shared select-time bloom sits behind the band. */}
      <SelectionGlow selected={selected} radius={radii.card} />
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
          styles.band,
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
        <Text variant="body" color={colors.text}>
          {option.label}
        </Text>
      </AnimatedPressable>
    </View>
  );
}

const styles = StyleSheet.create({
  // A positioned wrapper carrying the inter-band gap so the bloom sits behind.
  cell: {
    position: 'relative',
    marginBottom: spacing.s3,
  },
  band: {
    paddingVertical: spacing.s6,
    paddingHorizontal: spacing.s4,
    borderCurve: 'continuous',
  },
});
