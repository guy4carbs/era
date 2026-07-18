/**
 * PhotoOptionGrid — a 2-column grid of 4:5 photo cards (single-select).
 *
 * Each option is a tappable image card. Selection draws an accent ring and
 * lifts the card (e3). A tap fires a selection haptic tick; the flow advances
 * after the motion settles. When an option's image key is missing, the card
 * degrades to a token gradient placeholder rather than a broken image.
 */
import { layout, radii, rnShadow, spacing } from '@era/tokens';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { Image, Pressable, StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue } from 'react-native-reanimated';

import { Text } from '@/components/Text';
import { animate, useReducedMotionSafe } from '@/lib/motion';
import { useTheme } from '@/lib/theme';

import { imageFor } from './imageFor';
import { imageKeyOf, type QuizOption, type QuizStep } from './contract';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);
const PRESS_SCALE = 0.97;
const REST_SCALE = 1;
const COLUMN_GAP = spacing.s3;

interface PhotoOptionGridProps {
  readonly step: QuizStep;
  readonly selected: string | undefined;
  readonly onSelect: (optionId: string) => void;
}

export function PhotoOptionGrid({ step, selected, onSelect }: PhotoOptionGridProps) {
  return (
    <View style={styles.grid}>
      {step.options.map((option) => (
        <PhotoOption
          key={option.id}
          option={option}
          selected={option.id === selected}
          onSelect={onSelect}
        />
      ))}
    </View>
  );
}

interface PhotoOptionProps {
  readonly option: QuizOption;
  readonly selected: boolean;
  readonly onSelect: (optionId: string) => void;
}

function PhotoOption({ option, selected, onSelect }: PhotoOptionProps) {
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
        onSelect(option.id);
      }}
      style={[
        styles.card,
        selected ? rnShadow('e3') : rnShadow('e2'),
        {
          aspectRatio: layout.itemCard.ratio,
          borderRadius: radii.card,
          backgroundColor: colors.surface,
          borderColor: selected ? colors.accent : colors.hairline,
          borderWidth: selected ? 2 : StyleSheet.hairlineWidth,
        },
        animatedStyle,
      ]}
    >
      {source ? (
        <Image source={source} style={styles.image} resizeMode="cover" accessible={false} />
      ) : (
        <LinearGradient
          colors={[colors.surface, colors.hairline]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.image}
        />
      )}
      <View style={[styles.labelBar, { backgroundColor: colors.surface }]}>
        <Text numberOfLines={1} variant="ui" size="footnote" color={colors.text}>
          {option.label}
        </Text>
      </View>
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: COLUMN_GAP,
  },
  card: {
    // Two columns: flex-basis just under half so the row gap fits between them.
    flexBasis: '47%',
    flexGrow: 1,
    overflow: 'hidden',
    borderCurve: 'continuous',
  },
  image: {
    flex: 1,
    width: '100%',
  },
  labelBar: {
    paddingVertical: spacing.s2,
    paddingHorizontal: spacing.s3,
  },
});
