/**
 * PhotoOptionGrid — a 2-column grid of full-bleed 4:5 photo cards (single-select).
 *
 * Each option is a tappable image card whose photo fills the card edge-to-edge
 * (cover-fit); when an option's image key is missing the card degrades to a token
 * gradient that letterboxes on `colors.bg` (Era's warm cream — never black). The
 * label rides a glass caption band pinned to the bottom edge (the busy-glass
 * grammar, so it clears AA over any photo).
 *
 * Interaction: PRESS_SCALE compresses on press-in; on selection an accent glow
 * blooms base → peak (the GlowBloom grammar) and settles into the 2px accent
 * border. A tap fires a selection haptic tick; the flow advances after the motion
 * settles. Reduced motion holds the glow at its resting value — no bloom.
 */
import { layout, radii, rnShadow, spacing } from '@era/tokens';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { Image, Pressable, StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue } from 'react-native-reanimated';

import { GlassPanel } from '@/components/GlassPanel';
import { Text } from '@/components/Text';
import { PRESS_SCALE, animate, useReducedMotionSafe } from '@/lib/motion';
import { useTheme } from '@/lib/theme';

import { SelectionGlow } from './SelectionGlow';
import { imageFor } from './imageFor';
import { imageKeyOf, type QuizOption, type QuizStep } from './contract';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);
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
  const { colors, resolved } = useTheme();
  const reduced = useReducedMotionSafe();
  const scale = useSharedValue(REST_SCALE);

  const cardStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const source = imageFor(imageKeyOf(option));

  return (
    <View style={styles.cell}>
      {/* Behind the card, the shared select-time bloom (ramps base → peak, then
          the 2px accent border carries the settled selection). */}
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
          styles.card,
          selected ? rnShadow('e3', resolved) : rnShadow('e2', resolved),
          {
            aspectRatio: layout.itemCard.ratio,
            borderRadius: radii.card,
            // The card bg IS the mode bg so a contain-fit fallback letterboxes in
            // Era's warm cream, never a hard black.
            backgroundColor: colors.bg,
            borderColor: selected ? colors.accent : colors.hairline,
            borderWidth: selected ? 2 : StyleSheet.hairlineWidth,
          },
          cardStyle,
        ]}
      >
        {source ? (
          // Full-bleed: the photo fills the card edge-to-edge, cover-cropped.
          <Image source={source} style={StyleSheet.absoluteFill} resizeMode="cover" accessible={false} />
        ) : (
          <LinearGradient
            colors={[colors.surface, colors.hairline]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
        )}
        {/* Caption band — glass at the busy-tint strength, pinned to the bottom
            edge so the label reads over any photo (the busy-glass grammar). */}
        <GlassPanel busy radius={0} style={styles.caption}>
          <Text numberOfLines={1} variant="ui" size="footnote" color={colors.text}>
            {option.label}
          </Text>
        </GlassPanel>
      </AnimatedPressable>
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: COLUMN_GAP,
  },
  // The cell owns the two-column basis; the card fills it and the glow sits behind.
  cell: {
    flexBasis: '47%',
    flexGrow: 1,
  },
  card: {
    width: '100%',
    overflow: 'hidden',
    borderCurve: 'continuous',
    justifyContent: 'flex-end',
  },
  caption: {
    // A busy-glass band hugging the bottom edge; GlassPanel paints the tint stack.
    paddingVertical: spacing.s2,
    paddingHorizontal: spacing.s3,
  },
});
