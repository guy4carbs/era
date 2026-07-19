/**
 * CutoutTile — one 2.5D piece in the closet gallery.
 *
 * A thin closet wrapper over the shared {@link ItemSurface} engine: the surface
 * owns the premium treatment (hairline squircle, e3→e4 shadow, accent-glow
 * underlay, sheen, warm-tone wash, the hero press-lift), and this wrapper adds
 * the two closet-only behaviours the surface leaves to its consumers:
 *
 *   - TILT-ON-DRAG: a PanResponder (gesture-handler isn't a dependency here)
 *     claims a horizontal-dominant drag past a 4px slop and feeds −1..1 per-axis
 *     fractions into the surface's `dragX`/`dragY`, which the engine maps to its
 *     tilt + image parallax. A `dragActive` (0..1) blooms the surface's shadow +
 *     glow while the drag is live. A pure tap never claims — it falls through to
 *     the surface's own Pressable (which fires the selection haptic + opens the
 *     detail sheet). Under reduced motion the responder never claims and the
 *     tile is static.
 *   - The DRAFT DOT (`badge`): an unconfirmed piece gets a quiet accent dot so
 *     the tap-to-review path is discoverable; decorative, never intercepts taps.
 *
 * The optional device-tilt FIELD ({@link useTiltField}) sums a subtle drift under
 * the drag — the whole grid breathing with the wrist, the touched tile leaning
 * fully on top.
 */
import { strings } from '@era/core/strings';
import { layout, motion, spacing } from '@era/tokens';
import { useRef } from 'react';
import { PanResponder, StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import { useSharedValue, withSpring, withTiming } from 'react-native-reanimated';

import { Text } from '@/components/Text';
import { ItemSurface, useTiltField, type ItemWithDisplay } from '@/components/items';
import { springFromToken, useReducedMotionSafe } from '@/lib/motion';
import { useTheme } from '@/lib/theme';

// Horizontal travel (px) past which a drag is treated as an intentional tilt and
// the responder is claimed from the scroll list.
const CLAIM_SLOP = 4;

interface CutoutTileProps {
  readonly item: ItemWithDisplay;
  readonly onPress: (item: ItemWithDisplay) => void;
}

function clamp(value: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, value));
}

export function CutoutTile({ item, onPress }: CutoutTileProps) {
  const { colors } = useTheme();
  const reduced = useReducedMotionSafe();
  const tiltField = useTiltField();

  // −1..1 drag fractions per axis, fed to the surface engine. `dragActive`
  // (0..1) blooms the surface shadow + glow while the drag is live.
  const dragX = useSharedValue(0);
  const dragY = useSharedValue(0);
  const dragActive = useSharedValue(0);

  // The PanResponder is created once; its handlers read live props/flags through
  // this ref so a recycled row or a reduced-motion toggle never uses stale values.
  const latest = useRef({ reduced, item, onPress });
  latest.current = { reduced, item, onPress };
  const size = useRef({ w: 0, h: 0 });

  const responder = useRef(
    PanResponder.create({
      // A pure tap never claims — it falls through to the surface's Pressable.
      onStartShouldSetPanResponder: () => false,
      // Claim only a horizontal-dominant drag, so vertical scrolls pass through.
      onMoveShouldSetPanResponder: (_event, gesture) =>
        !latest.current.reduced &&
        Math.abs(gesture.dx) > Math.abs(gesture.dy) &&
        Math.abs(gesture.dx) > CLAIM_SLOP,
      onPanResponderGrant: () => {
        dragActive.value = withSpring(1, springFromToken('snappy'));
      },
      onPanResponderMove: (_event, gesture) => {
        const { w, h } = size.current;
        if (w > 0 && h > 0) {
          dragX.value = clamp(gesture.dx / (w / 2), -1, 1);
          dragY.value = clamp(gesture.dy / (h / 2), -1, 1);
        }
      },
      onPanResponderRelease: settle,
      onPanResponderTerminate: settle,
    }),
  ).current;

  // Spring the tilt back to rest (a short fade under reduced motion) and fade the
  // active bloom out. `dragActive` only ever rose when motion is allowed.
  function settle() {
    const back = (): number =>
      latest.current.reduced
        ? withTiming(0, { duration: motion.durations.reducedFadeMs })
        : withSpring(0, springFromToken('snappy'));
    dragX.value = back();
    dragY.value = back();
    dragActive.value = withSpring(0, springFromToken('snappy'));
  }

  const draftBadge = !item.tagsConfirmed ? (
    <View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[styles.draftDot, { backgroundColor: colors.accent, borderColor: colors.surface }]}
    />
  ) : undefined;

  return (
    <View style={styles.cell}>
      <View
        {...responder.panHandlers}
        onLayout={(event: LayoutChangeEvent) => {
          const { width, height } = event.nativeEvent.layout;
          size.current = { w: width, h: height };
        }}
      >
        <ItemSurface
          uri={item.displayUrl ?? null}
          accessibilityLabel={
            item.tagsConfirmed ? item.name : strings.closet.draftTileA11y(item.name)
          }
          interactive="press"
          onPress={() => latest.current.onPress(latest.current.item)}
          badge={draftBadge}
          tiltField={tiltField}
          dragX={dragX}
          dragY={dragY}
          dragActive={dragActive}
        />
      </View>
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
  cell: {
    flex: 1,
    gap: spacing.s2,
  },
  // A small accent dot pinned to the card's top-right, ringed in the surface
  // colour so it reads over any cutout. Diameter + inset match web's GalleryTile
  // for parity (spacing.s2 = 8px dot, itemCard.padding = 12px in); the radius
  // equals the diameter so it renders fully round.
  draftDot: {
    position: 'absolute',
    top: layout.itemCard.padding,
    right: layout.itemCard.padding,
    width: spacing.s2,
    height: spacing.s2,
    borderRadius: spacing.s2,
    borderWidth: StyleSheet.hairlineWidth,
  },
  caption: {
    paddingHorizontal: spacing.s1,
  },
});
