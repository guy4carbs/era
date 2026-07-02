/**
 * OccasionChips — the occasions step (multi-select).
 *
 * Occasions are the one place the quiz takes several answers, so options are
 * toggle chips rather than one-tap cards. Each chip pairs a small thumbnail
 * with its label, meets the 44pt touch target, and fires a selection tick on
 * every toggle. A missing image degrades to a token gradient swatch. The parent
 * supplies a Continue button; toggling never auto-advances.
 */
import { layout, radii, spacing, typeRamp } from '@era/tokens';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue } from 'react-native-reanimated';

import { animate, useReducedMotionSafe } from '@/lib/motion';
import { useTheme } from '@/lib/theme';

import { imageFor } from './imageFor';
import { imageKeyOf, type QuizOption, type QuizStep } from './contract';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);
const PRESS_SCALE = 0.95;
const REST_SCALE = 1;
const THUMB_SIZE = spacing.s8; // 32pt thumbnail

interface OccasionChipsProps {
  readonly step: QuizStep;
  readonly selected: readonly string[];
  readonly onToggle: (optionId: string) => void;
}

export function OccasionChips({ step, selected, onToggle }: OccasionChipsProps) {
  return (
    <View style={styles.wrap}>
      {step.options.map((option) => (
        <OccasionChip
          key={option.id}
          option={option}
          selected={selected.includes(option.id)}
          onToggle={onToggle}
        />
      ))}
    </View>
  );
}

interface OccasionChipProps {
  readonly option: QuizOption;
  readonly selected: boolean;
  readonly onToggle: (optionId: string) => void;
}

function OccasionChip({ option, selected, onToggle }: OccasionChipProps) {
  const { colors } = useTheme();
  const reduced = useReducedMotionSafe();
  const scale = useSharedValue(REST_SCALE);
  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  const source = imageFor(imageKeyOf(option));

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
        onToggle(option.id);
      }}
      style={[
        styles.chip,
        {
          minHeight: layout.touchTarget.ios,
          borderRadius: radii.input,
          backgroundColor: selected ? `${colors.accent}29` : colors.surface,
          borderColor: selected ? colors.accent : colors.hairline,
          borderWidth: selected ? 2 : StyleSheet.hairlineWidth,
        },
        animatedStyle,
      ]}
    >
      {source ? (
        <Image source={source} style={styles.thumb} resizeMode="cover" accessible={false} />
      ) : (
        <LinearGradient
          colors={[colors.surface, colors.hairline]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.thumb}
        />
      )}
      <Text style={{ color: colors.text, fontSize: typeRamp.footnote.pt, lineHeight: typeRamp.footnote.lineHeight }}>
        {option.label}
      </Text>
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.s3,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s2,
    paddingRight: spacing.s4,
    paddingLeft: spacing.s1,
    paddingVertical: spacing.s1,
    borderCurve: 'continuous',
    overflow: 'hidden',
  },
  thumb: {
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    borderRadius: radii.chip,
  },
});
