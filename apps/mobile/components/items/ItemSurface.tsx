/**
 * ItemSurface — the shared premium 2.5D surface for a single garment cutout.
 *
 * Extracted from the closet's CutoutTile so every surface that shows a cutout
 * (closet gallery, Ovi proposals, outfit collages) shares ONE treatment: a 4:5
 * squircle card on the theme surface, a hairline border, the e3 ambient ink
 * shadow with an accent-glow underlay beneath it (RN casts one shadow per view,
 * so the halo lives on its own layer — the dual-depth workaround), a faint 135°
 * specular sheen, a 1% warm-tone accent wash, and the come-alive interactions.
 *
 * Interactions (`interactive`):
 *   - 'press' — the HERO LIFT. Press-in raises the card toward the viewer
 *     (`layout.itemCard.lift`: −4px, ×1.02) on a snappy spring while the ink
 *     shadow deepens e3 → e4 and the accent glow blooms. This deliberately
 *     REPLACES the universal 0.97 press-compress on this component: the item is
 *     the product, so it rises rather than shrinks. Every value comes from the
 *     token — there is no local press-scale const (the motion guard forbids it).
 *   - 'none' — no handlers; the surface is composed inside a pressable parent
 *     (a collage tile inside a card that itself presses).
 *
 * `selected` holds the glow underlay at full `glow.opacity[resolved]` and the
 * shadow at e4 — the bloom that peaks on touch, held.
 *
 * `forcedState` paints a static lab specimen (rest | lift | tilt | selected)
 * with no handlers, for the design-lab matrix.
 *
 * `tiltField` is an optional shared value (from {@link TiltField}) carrying a
 * subtle device-tilt drift; when present the surface adds it to its transform so
 * a field of cards breathes with the wrist. The touched tile's own drag-tilt (in
 * the closet wrapper) sums on top.
 *
 * Reduced motion: springs collapse to the sanctioned fade, and the glow/lift
 * hold flat — the surface reads as the plain static cutout when untouched.
 */
import {
  elevation,
  elevationDark,
  glow,
  layout,
  motion,
  radii,
  rnShadow,
  sheen,
  spacing,
} from '@era/tokens';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View, type ImageStyle, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  interpolate,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

import { springFromToken, useReducedMotionSafe } from '@/lib/motion';
import { useTheme } from '@/lib/theme';

const { lift } = layout.itemCard;
const REST_SCALE = 1;
const REST_TRANSLATE = 0;

// The ink shadow deepens from e3's ambient layer toward e4 as the surface
// activates (press / selected). Per-mode: dark carries the heavier opacities.
const REST_SHADOW = { light: elevation.e3.ambient, dark: elevationDark.e3.ambient } as const;
const ACTIVE_SHADOW = { light: elevation.e4, dark: elevationDark.e4 } as const;

/** A drift pose (deg + parallax px) shared by a whole field of surfaces. */
export interface TiltFieldValue {
  readonly rotateX: number;
  readonly rotateY: number;
  readonly parallaxX: number;
  readonly parallaxY: number;
}

/** A static lab pose. `rest` is the untouched surface. */
export type ForcedState = 'rest' | 'lift' | 'tilt' | 'selected';

export interface ItemSurfaceProps {
  /**
   * Cutout image. A URL string for real items, a bundled asset (the `number`
   * `require()` returns) for the lab, or `null` for a token-gradient placeholder.
   */
  readonly uri: string | number | null;
  readonly accessibilityLabel: string;
  /** Holds the glow + e4 shadow steady — the touch-peak bloom, pinned. */
  readonly selected?: boolean;
  /**
   * 'press' owns the hero-lift handlers + haptic; 'none' composes statically
   * inside a pressable parent (the tilt lives in the closet wrapper, not here).
   */
  readonly interactive?: 'press' | 'none';
  /** Static lab pose — no handlers when set. */
  readonly forcedState?: ForcedState;
  readonly onPress?: () => void;
  /** Pinned to the card's top-right (e.g. the closet draft dot). */
  readonly badge?: ReactNode;
  /** Optional device-tilt drift shared across a field of surfaces. */
  readonly tiltField?: SharedValue<TiltFieldValue>;
  /** Applied to the outer sizing wrapper (width/aspect come from the caller). */
  readonly style?: StyleProp<ViewStyle>;
  /**
   * Fill the parent (100% × 100%) instead of imposing the 4:5 item-card aspect.
   * For collage tiles that live in a caller-sized grid cell — the surface brings
   * the hairline / sheen / warm-tone / padding, the cell keeps its own size.
   */
  readonly fill?: boolean;
  /**
   * Live drag-tilt driver (closet only): −1..1 fractions per axis mapped to the
   * tilt transforms + image parallax. Left unset for every non-closet consumer.
   */
  readonly dragX?: SharedValue<number>;
  readonly dragY?: SharedValue<number>;
  /** 0..1 activation from the wrapper's drag (deepens shadow + glow). */
  readonly dragActive?: SharedValue<number>;
}

// Depth for the 3D rotation, derived from spacing tokens (s16 × 12 = 768) to
// match CutoutTile / DimensionalHero — a mid-depth field where 7° reads as a
// lean, not a fold. A unitless multiple of a token, never a raw px literal.
const PERSPECTIVE = spacing.s16 * 12;

// The forced 'tilt' lab pose — a fixed lean so the specular sheen + parallax
// read in a static screenshot. Small integer degrees within motion.tilt.maxDeg.
const FORCED_TILT = { rotateX: -4, rotateY: 5 } as const;

export function ItemSurface({
  uri,
  accessibilityLabel,
  selected = false,
  interactive = 'press',
  forcedState,
  onPress,
  badge,
  tiltField,
  style,
  fill = false,
  dragX,
  dragY,
  dragActive,
}: ItemSurfaceProps) {
  const { colors, resolved } = useTheme();
  const reduced = useReducedMotionSafe();

  // Press-lift drivers. `press` (0..1) drives the lift transform; `pressActive`
  // (0..1) drives the shadow-deepen + glow-bloom on press. Both spring back on
  // release; both hold flat under reduced motion (see liftTo / the guards).
  const press = useSharedValue(0);
  const pressActive = useSharedValue(0);

  const rest = REST_SHADOW[resolved];
  const activeShadow = ACTIVE_SHADOW[resolved];
  const glowPeak = glow.opacity[resolved];

  // The come-alive signal (0..1) is the max of three sources: the press bloom,
  // an optional wrapper drag activation, and a steady `selected` floor. Selected
  // therefore holds the glow + e4 shadow at full without any touch, and a press
  // or drag can only ever add to it — never fight it.
  const dragActiveSV = dragActive;
  const selectedFloor = selected ? 1 : 0;
  const combinedActive = useDerivedValue(() =>
    Math.max(pressActive.value, dragActiveSV ? dragActiveSV.value : 0, selectedFloor),
  );

  // Card transform: press-lift + optional field drift + optional wrapper drag.
  const dxSV = dragX;
  const dySV = dragY;
  const fieldSV = tiltField;
  const cardStyle = useAnimatedStyle(() => {
    const rotX = (dySV ? -dySV.value * motion.tilt.maxDeg : 0) + (fieldSV ? fieldSV.value.rotateX : 0);
    const rotY = (dxSV ? dxSV.value * motion.tilt.maxDeg : 0) + (fieldSV ? fieldSV.value.rotateY : 0);
    const lifted = press.value;
    return {
      transform: [
        { perspective: PERSPECTIVE },
        { rotateX: `${rotX}deg` },
        { rotateY: `${rotY}deg` },
        { translateY: interpolate(lifted, [0, 1], [REST_TRANSLATE, lift.yPx]) },
        { scale: interpolate(lifted, [0, 1], [REST_SCALE, lift.scale]) },
      ],
      shadowRadius: interpolate(combinedActive.value, [0, 1], [rest.blur, activeShadow.blur]),
      shadowOpacity: interpolate(combinedActive.value, [0, 1], [rest.opacity, activeShadow.opacity]),
    };
  });

  const glowStyle = useAnimatedStyle(() => ({
    opacity: combinedActive.value * glowPeak,
  }));

  const imageStyle = useAnimatedStyle(() => {
    const px = (dxSV ? dxSV.value * motion.tilt.parallaxPx : 0) + (fieldSV ? fieldSV.value.parallaxX : 0);
    const py = (dySV ? dySV.value * motion.tilt.parallaxPx : 0) + (fieldSV ? fieldSV.value.parallaxY : 0);
    return { transform: [{ translateX: px }, { translateY: py }] };
  });

  // Forced lab poses paint static style branches (no handlers, no drivers).
  const forced = forcedState ? forcedStyle(forcedState, rest, activeShadow) : null;

  const liftTo = (to: number): number =>
    reduced ? withTiming(to, { duration: motion.durations.reducedFadeMs }) : withSpring(to, springFromToken('snappy'));

  const glowUnderlay = (
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
          shadowOpacity: glowPeak,
        },
        forced ? { opacity: forced.glowOpacity } : glowStyle,
      ]}
    />
  );

  const surfaceContent = (
    <>
      {uri != null ? (
        <Animated.Image
          source={typeof uri === 'number' ? uri : { uri }}
          style={[styles.image, forced ? forced.imageStyle : imageStyle]}
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
      {/* Warm-tone wash — a 1% accent-hued overlay so mixed-source photos
          harmonize on the cream surface. Above the image, below the sheen. */}
      <View
        pointerEvents="none"
        style={[
          StyleSheet.absoluteFill,
          { backgroundColor: colors.accent, opacity: layout.itemCard.warmToneOpacity },
        ]}
      />
      {/* 135° specular sheen — the premium cue (item cards + primary buttons). */}
      <LinearGradient
        colors={[sheen.from[resolved], sheen.to]}
        locations={[0, 0.6]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        pointerEvents="none"
        style={StyleSheet.absoluteFill}
      />
    </>
  );

  const cardBaseStyle = [
    styles.card,
    rnShadow('e3', resolved),
    {
      backgroundColor: colors.surface,
      borderColor: colors.hairline,
      borderRadius: radii.card,
      padding: layout.itemCard.padding,
    },
    forced ? forced.cardStyle : cardStyle,
  ];

  const innerStyle = [styles.inner, { borderRadius: radii.card - spacing.s1 }];

  return (
    <View style={[fill ? styles.wrapFill : styles.wrap, style]}>
      {glowUnderlay}
      <Animated.View style={cardBaseStyle}>
        {interactive === 'press' && !forcedState ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={accessibilityLabel}
            accessibilityState={{ selected }}
            onPressIn={() => {
              press.value = liftTo(1);
              if (!reduced) pressActive.value = withSpring(1, springFromToken('snappy'));
            }}
            onPressOut={() => {
              press.value = liftTo(0);
              if (!reduced) pressActive.value = withSpring(0, springFromToken('snappy'));
            }}
            onPress={() => {
              void Haptics.selectionAsync();
              onPress?.();
            }}
            style={innerStyle}
          >
            {surfaceContent}
          </Pressable>
        ) : (
          <View
            accessibilityLabel={forcedState ? undefined : accessibilityLabel}
            accessible={!forcedState && interactive !== 'none'}
            style={innerStyle}
          >
            {surfaceContent}
          </View>
        )}
      </Animated.View>
      {badge}
    </View>
  );
}

interface ForcedStyle {
  readonly imageStyle: ImageStyle;
  readonly glowOpacity: number;
  readonly cardStyle: ViewStyle;
}

/** Static style branches for the lab's forced poses. */
function forcedStyle(
  state: ForcedState,
  rest: { blur: number; opacity: number },
  activeShadow: { blur: number; opacity: number },
): ForcedStyle {
  const base: ForcedStyle = {
    imageStyle: EMPTY_TRANSFORM,
    glowOpacity: 0,
    cardStyle: {
      transform: [{ perspective: PERSPECTIVE }],
      shadowRadius: rest.blur,
      shadowOpacity: rest.opacity,
    },
  };
  if (state === 'lift') {
    return {
      ...base,
      cardStyle: {
        transform: [{ perspective: PERSPECTIVE }, { translateY: lift.yPx }, { scale: lift.scale }],
        shadowRadius: activeShadow.blur,
        shadowOpacity: activeShadow.opacity,
      },
    };
  }
  if (state === 'tilt') {
    return {
      imageStyle: {
        transform: [{ translateX: -motion.tilt.parallaxPx }, { translateY: motion.tilt.parallaxPx }],
      },
      glowOpacity: 0,
      cardStyle: {
        transform: [
          { perspective: PERSPECTIVE },
          { rotateX: `${FORCED_TILT.rotateX}deg` },
          { rotateY: `${FORCED_TILT.rotateY}deg` },
        ],
        shadowRadius: rest.blur,
        shadowOpacity: rest.opacity,
      },
    };
  }
  if (state === 'selected') {
    return {
      ...base,
      glowOpacity: 1,
      cardStyle: {
        transform: [{ perspective: PERSPECTIVE }],
        shadowRadius: activeShadow.blur,
        shadowOpacity: activeShadow.opacity,
      },
    };
  }
  return base; // rest
}

const EMPTY_TRANSFORM: ImageStyle = { transform: [] };

// A centered (offsetless) shadow so the accent glow reads as an even halo.
const GLOW_OFFSET = { width: 0, height: 0 } as const;

const styles = StyleSheet.create({
  // The wrapper sizes the surface; caller sets width + aspectRatio via `style`.
  wrap: {
    width: '100%',
    aspectRatio: layout.itemCard.ratio,
  },
  // `fill` variant — the surface fills a caller-sized cell (collage tiles).
  wrapFill: {
    width: '100%',
    height: '100%',
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
  image: {
    flex: 1,
    width: '100%',
  },
});
