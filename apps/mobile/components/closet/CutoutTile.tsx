/**
 * CutoutTile — one 2.5D piece in the closet gallery.
 *
 * The cutout floats on a cream/charcoal surface (theme) with the e3 dual shadow
 * (approximated by RN's single ambient layer per the established note), a uniform
 * inset, and an iOS squircle (`borderCurve: 'continuous'`). A 135° specular sheen
 * overlays the image for the "premium" cue.
 *
 * TILT-ON-DRAG: a PanResponder (gesture-handler isn't a dependency) tilts the
 * card up to `motion.tilt.maxDeg` around both axes and parallax-shifts the image
 * up to `motion.tilt.parallaxPx`, springing back on release. The responder only
 * claims a horizontal-dominant drag, so the gallery still scrolls vertically and
 * a plain tap falls through to the inner Pressable (which opens the detail sheet
 * with a selection haptic). Under reduced motion the responder never claims and
 * the tile is static.
 *
 * COME-ALIVE ON TOUCH: with no hover on touch, the press (tap) and the active
 * tilt-drag are the trigger. On either, the card's ink shadow deepens e3 → e4 and
 * an accent glow blooms behind it — the halo is a separate underlay carrying an
 * accent-hued shadow at the per-mode `glow.opacity`, since RN renders one shadow
 * per view (this mirrors the web tile's dual box-shadow). Both spring in on
 * press/drag and out on release. Under reduced motion neither fires: the card
 * holds a static e3 with no glow.
 */
import { strings } from '@era/core/strings';
import { elevation, glow, layout, motion, radii, rnShadow, sheen, spacing } from '@era/tokens';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { useRef } from 'react';
import {
  PanResponder,
  Pressable,
  StyleSheet,
  View,
  type LayoutChangeEvent,
} from 'react-native';
import Animated, {
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { Text } from '@/components/Text';
import type { ItemWithDisplay } from '@/components/items';
import { springFromToken, useReducedMotionSafe } from '@/lib/motion';
import { useTheme } from '@/lib/theme';

const { maxDeg, parallaxPx } = motion.tilt;
// Depth for the 3D rotation, derived from spacing tokens (s16 × 12 = 768) to
// match the web tile — a mid-depth field where the 7° tilt reads as a lean, not
// a fold. A unitless multiple of a token, never a raw px literal.
const PERSPECTIVE = spacing.s16 * 12;
const PRESS_SCALE = 0.98;
const REST_SCALE = 1;
// Horizontal travel (px) past which a drag is treated as an intentional tilt and
// the responder is claimed from the scroll list.
const CLAIM_SLOP = 4;

// The ink shadow deepens from e3's ambient layer toward e4 as the tile activates.
const REST_SHADOW = elevation.e3.ambient;
const ACTIVE_SHADOW = elevation.e4;

interface CutoutTileProps {
  readonly item: ItemWithDisplay;
  readonly onPress: (item: ItemWithDisplay) => void;
}

function clamp(value: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, value));
}

export function CutoutTile({ item, onPress }: CutoutTileProps) {
  const { colors, resolved } = useTheme();
  const reduced = useReducedMotionSafe();

  // -1..1 drag fractions per axis; drive both the tilt and the image parallax.
  const dragX = useSharedValue(0);
  const dragY = useSharedValue(0);
  const pressScale = useSharedValue(REST_SCALE);
  // 0 at rest, 1 while pressed or actively tilt-dragging — drives the shadow
  // deepen and the accent-glow bloom. Never leaves 0 under reduced motion.
  const active = useSharedValue(0);

  // The PanResponder is created once; its handlers read live props/flags through
  // this ref so a recycled row or a reduced-motion toggle never uses stale values.
  const latest = useRef({ reduced, item, onPress });
  latest.current = { reduced, item, onPress };
  const size = useRef({ w: 0, h: 0 });

  const responder = useRef(
    PanResponder.create({
      // A pure tap never claims — it falls through to the inner Pressable.
      onStartShouldSetPanResponder: () => false,
      // Claim only a horizontal-dominant drag, so vertical scrolls pass through.
      onMoveShouldSetPanResponder: (_event, gesture) =>
        !latest.current.reduced &&
        Math.abs(gesture.dx) > Math.abs(gesture.dy) &&
        Math.abs(gesture.dx) > CLAIM_SLOP,
      // The drag was claimed (only ever when motion is allowed) — bloom the tile.
      onPanResponderGrant: () => {
        active.value = withSpring(1, springFromToken('snappy'));
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
  // active bloom out. `active` only ever rose when motion is allowed.
  function settle() {
    const back = (): number =>
      latest.current.reduced
        ? withTiming(0, { duration: motion.durations.reducedFadeMs })
        : withSpring(0, springFromToken('snappy'));
    dragX.value = back();
    dragY.value = back();
    active.value = withSpring(0, springFromToken('snappy'));
  }

  const tileStyle = useAnimatedStyle(() => ({
    transform: [
      { perspective: PERSPECTIVE },
      { rotateY: `${dragX.value * maxDeg}deg` },
      { rotateX: `${-dragY.value * maxDeg}deg` },
      { scale: pressScale.value },
    ],
    // Deepen the ink shadow e3 → e4 as the tile activates (base props come from
    // rnShadow('e3') below; these two override toward the e4 values).
    shadowRadius: interpolate(active.value, [0, 1], [REST_SHADOW.blur, ACTIVE_SHADOW.blur]),
    shadowOpacity: interpolate(
      active.value,
      [0, 1],
      [REST_SHADOW.opacity, ACTIVE_SHADOW.opacity],
    ),
  }));

  // The accent glow lives on its own underlay (RN casts one shadow per view); its
  // opacity blooms with `active`, so the halo fades in on press/drag and out on
  // release. Held at 0 under reduced motion.
  const glowStyle = useAnimatedStyle(() => ({ opacity: active.value }));

  const imageStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: dragX.value * parallaxPx },
      { translateY: dragY.value * parallaxPx },
    ],
  }));

  const pressTo = (to: number): number =>
    reduced ? withTiming(to, { duration: motion.durations.reducedFadeMs }) : withSpring(to, springFromToken('snappy'));

  return (
    <View style={styles.cell}>
      <View
        style={styles.cardWrap}
        onLayout={(event: LayoutChangeEvent) => {
          const { width, height } = event.nativeEvent.layout;
          size.current = { w: width, h: height };
        }}
      >
        {/* Accent-glow underlay — hidden behind the card; only its halo shows. */}
        <Animated.View
          pointerEvents="none"
          style={[
            styles.glow,
            {
              backgroundColor: colors.surface,
              borderRadius: radii.card,
              shadowColor: colors.accent,
              shadowOffset: GLOW_OFFSET,
              shadowRadius: glow.blurRadius,
              shadowOpacity: glow.opacity[resolved],
            },
            glowStyle,
          ]}
        />
        <Animated.View
          {...responder.panHandlers}
          style={[
            styles.card,
            rnShadow('e3'),
            {
              backgroundColor: colors.surface,
              borderColor: colors.hairline,
              borderRadius: radii.card,
              padding: layout.itemCard.padding,
            },
            tileStyle,
          ]}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={
              item.tagsConfirmed ? item.name : strings.closet.draftTileA11y(item.name)
            }
            onPressIn={() => {
              pressScale.value = pressTo(PRESS_SCALE);
              if (!reduced) active.value = withSpring(1, springFromToken('snappy'));
            }}
            onPressOut={() => {
              pressScale.value = pressTo(REST_SCALE);
              if (!reduced) active.value = withSpring(0, springFromToken('snappy'));
            }}
            onPress={() => {
              void Haptics.selectionAsync();
              onPress(item);
            }}
            style={[styles.inner, { borderRadius: radii.card - spacing.s1 }]}
          >
            {item.displayUrl ? (
              <Animated.Image
                source={{ uri: item.displayUrl }}
                style={[styles.image, imageStyle]}
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
            {/* 135° specular sheen — item-card + primary button only, per spec. */}
            <LinearGradient
              colors={[sheen.from, sheen.to]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              pointerEvents="none"
              style={StyleSheet.absoluteFill}
            />
          </Pressable>
        </Animated.View>
        {/* Draft flag: an unconfirmed piece (backed-out add-flow, receipt import)
            gets a quiet accent dot so the tap-to-review path is discoverable. The
            a11y state lives on the Pressable's label; this dot is decorative and
            never intercepts the tap. Confirmed pieces show nothing. */}
        {!item.tagsConfirmed ? (
          <View
            pointerEvents="none"
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            style={[styles.draftDot, { backgroundColor: colors.accent, borderColor: colors.surface }]}
          />
        ) : null}
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

// A centered (offsetless) shadow so the accent glow reads as an even halo.
const GLOW_OFFSET = { width: 0, height: 0 } as const;

const styles = StyleSheet.create({
  cell: {
    flex: 1,
    gap: spacing.s2,
  },
  // Sizes the tile; the card and its glow underlay fill it, so the halo can
  // spill past the card edges.
  cardWrap: {
    width: '100%',
    aspectRatio: layout.itemCard.ratio,
  },
  glow: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderCurve: 'continuous',
  },
  card: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderWidth: StyleSheet.hairlineWidth,
    borderCurve: 'continuous',
  },
  inner: {
    flex: 1,
    overflow: 'hidden',
    borderCurve: 'continuous',
  },
  // A small accent dot pinned to the card's top-right, ringed in the surface
  // colour so it reads over any cutout (a mobile-only addition — web tiles have a
  // consistent light backing). Diameter + inset match web's GalleryTile for
  // parity (spacing.s2 = 8px dot, itemCard.padding = 12px in); the radius equals
  // the diameter so it renders fully round.
  draftDot: {
    position: 'absolute',
    top: layout.itemCard.padding,
    right: layout.itemCard.padding,
    width: spacing.s2,
    height: spacing.s2,
    borderRadius: spacing.s2,
    borderWidth: StyleSheet.hairlineWidth,
  },
  image: {
    flex: 1,
    width: '100%',
  },
  caption: {
    paddingHorizontal: spacing.s1,
  },
});
