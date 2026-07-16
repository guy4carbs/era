/**
 * DimensionalHero — the item detail's cutout hero, given depth for free.
 *
 * Ports the web GalleryTile's premium 2.5D effect to touch: the card tilts up to
 * `motion.tilt.maxDeg` on both axes, the cutout floats `motion.tilt.parallaxPx`
 * AGAINST the tilt, and a 135° specular sheen slides opposite the cutout with an
 * opacity that rises from 0 (flat, at rest) toward a peak as the tilt nears max.
 * The pose is driven by two inputs summed together:
 *
 *   - the GYROSCOPE (`useAnimatedSensor(ROTATION)`), relative to a rolling
 *     baseline so the card sits flat however the user currently holds the phone —
 *     not against absolute gravity, which would leave it permanently leaning;
 *   - a TOUCH DRAG across the hero, which springs back to flat on release.
 *
 * A drop-in replacement for the static hero `Image` (`{ uri, accessibilityLabel,
 * style? }`, `resizeMode="contain"` preserved). Under reduced motion it renders
 * exactly that plain image — no sensor subscription, no gesture, no sheen — so
 * the tilting machinery never even mounts. On hardware without a rotation sensor
 * (a simulator, a cheap Android), the gyro contributes zero and the drag still
 * works; that falls out of the baseline math with no special-casing.
 *
 * The sheen is decorative: it is hidden from accessibility and the label/tap
 * surface is unchanged from the static image.
 */
import { motion, sheen, spacing } from '@era/tokens';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useMemo, useState } from 'react';
import { AccessibilityInfo, Image, StyleSheet, View, type LayoutChangeEvent, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  SensorType,
  useAnimatedSensor,
  useAnimatedStyle,
  useDerivedValue,
  useFrameCallback,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';

import { springFromToken, useReducedMotionSafe } from '@/lib/motion';
import { useTheme } from '@/lib/theme';
import {
  combineTilt,
  dragTilt,
  driftBaseline,
  parallaxFor,
  sheenFor,
  sheenOpacityFor,
  tiltFromDelta,
} from '@/lib/dimensional-tilt';

const { maxDeg, parallaxPx } = motion.tilt;

// Depth for the 3D rotation, derived from spacing tokens (s16 × 12 = 768) to
// match the web tile and CutoutTile — a mid-depth field where 7° reads as a lean,
// not a fold. A unitless multiple of a token, never a raw px literal.
const PERSPECTIVE = spacing.s16 * 12;

// The sheen slides a touch further than the cutout floats (1.5×), so the two
// clearly counter-move — the same ratio the web tile uses.
const SHEEN_SHIFT = parallaxPx * 1.5;

// Peak sheen-band opacity at full tilt, multiplying the already-faint white
// gradient (`sheen.from` = 5% white). Dimmer in dark mode, where a bright wash
// would read as glare on a charcoal card. At rest the opacity is 0 regardless.
const SHEEN_PEAK = { light: 1, dark: 0.6 } as const;

// Low-pass factor for the rolling baseline: ~2% per frame drifts the neutral
// pose toward how the phone is now held over roughly a second, slow enough that
// it never chases an intentional tilt.
const BASELINE_ALPHA = 0.02;

export interface DimensionalHeroProps {
  readonly uri: string;
  readonly accessibilityLabel: string;
  /**
   * True while the hosting sheet is actually open. GlassSheet keeps a closed
   * sheet mounted (translated off-screen), so unmount alone can't stop the
   * rotation sensor — this prop does: inactive renders the plain static image
   * and the sensor-bearing tilt tree leaves the tree entirely.
   */
  readonly active: boolean;
  /** Applied to the hero box — sizing matches the static Image it replaces. */
  readonly style?: StyleProp<ViewStyle>;
}

export function DimensionalHero({ uri, active, accessibilityLabel, style }: DimensionalHeroProps) {
  const reduced = useReducedMotionSafe();

  // Static-first: the tilt tree may only mount once the OS setting has resolved
  // to "motion allowed". useReducedMotionSafe defaults to false while its async
  // read is in flight, which would briefly mount the sensor tree even for
  // reduced-motion users; this one-tick gate closes that window (the first
  // frame is the identical static image either way, so nothing flashes).
  const [motionKnownOk, setMotionKnownOk] = useState(false);
  useEffect(() => {
    let live = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((value) => {
      if (live && !value) {
        setMotionKnownOk(true);
      }
    });
    return () => {
      live = false;
    };
  }, []);

  // Reduced motion, setting unresolved, or sheet dismissed: the exact static
  // image, flat in its hero box — the sensor-bearing tilt tree is not mounted
  // (no subscription, no gestures, no sheen).
  if (reduced || !motionKnownOk || !active) {
    return (
      <View style={style}>
        <Image
          source={{ uri }}
          style={styles.image}
          resizeMode="contain"
          accessibilityLabel={accessibilityLabel}
        />
      </View>
    );
  }

  return <TiltingHero uri={uri} accessibilityLabel={accessibilityLabel} style={style} />;
}

function TiltingHero({ uri, accessibilityLabel, style }: Omit<DimensionalHeroProps, 'active'>) {
  const { resolved } = useTheme();

  // Rotation sensor at ~60Hz (interval 16ms). Deliberately under Android 12's
  // 200Hz HIGH_SAMPLING_RATE_SENSORS threshold, so neither platform prompts for a
  // permission; iOS never requires one for device-motion at this rate.
  const { sensor } = useAnimatedSensor(SensorType.ROTATION, { interval: 16 });

  const sizeSV = useSharedValue(0); // hero width (px), for the drag→tilt mapping
  const dragging = useSharedValue(false); // freezes the baseline while dragging

  // Rolling neutral pose (radians) the gyro tilt is measured against.
  const basePitch = useSharedValue(0);
  const baseRoll = useSharedValue(0);
  const baselineReady = useSharedValue(false);

  // The two tilt inputs (degrees), summed into `combined`.
  const gyroRotX = useSharedValue(0);
  const gyroRotY = useSharedValue(0);
  const dragRotX = useSharedValue(0);
  const dragRotY = useSharedValue(0);

  const peak = resolved === 'dark' ? SHEEN_PEAK.dark : SHEEN_PEAK.light;
  const fluidSpring = useMemo(() => springFromToken('fluid'), []);

  // Every frame: seed the baseline on the first reading, then drift it slowly
  // toward the live pose (unless dragging), and derive the clamped gyro tilt.
  // On a sensor-less device the reading stays zero, so gyro tilt stays zero.
  useFrameCallback(() => {
    'worklet';
    const r = sensor.value;
    if (!baselineReady.value) {
      basePitch.value = r.pitch;
      baseRoll.value = r.roll;
      baselineReady.value = true;
    } else if (!dragging.value) {
      basePitch.value = driftBaseline(basePitch.value, r.pitch, BASELINE_ALPHA);
      baseRoll.value = driftBaseline(baseRoll.value, r.roll, BASELINE_ALPHA);
    }
    const tilt = tiltFromDelta(r.pitch - basePitch.value, r.roll - baseRoll.value, maxDeg);
    gyroRotX.value = tilt.rotateX;
    gyroRotY.value = tilt.rotateY;
  });

  const combined = useDerivedValue(() =>
    combineTilt(
      { rotateX: gyroRotX.value, rotateY: gyroRotY.value },
      { rotateX: dragRotX.value, rotateY: dragRotY.value },
      maxDeg,
    ),
  );

  // Horizontal-biased pan: activates on ~10px of horizontal travel and fails on
  // ~15px of vertical, so the sheet's own vertical ScrollView keeps vertical
  // drags. Gyro carries the rest of the dimensional feel while scrolling.
  const pan = useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetX([-10, 10])
        .failOffsetY([-15, 15])
        .onStart(() => {
          dragging.value = true;
        })
        .onUpdate((event) => {
          const tilt = dragTilt(event.translationX, event.translationY, sizeSV.value, maxDeg);
          dragRotX.value = tilt.rotateX;
          dragRotY.value = tilt.rotateY;
        })
        .onFinalize(() => {
          dragging.value = false;
          dragRotX.value = withSpring(0, fluidSpring);
          dragRotY.value = withSpring(0, fluidSpring);
        }),
    [dragging, sizeSV, dragRotX, dragRotY, fluidSpring],
  );

  const cardStyle = useAnimatedStyle(() => ({
    transform: [
      { perspective: PERSPECTIVE },
      { rotateX: `${combined.value.rotateX}deg` },
      { rotateY: `${combined.value.rotateY}deg` },
    ],
  }));

  const parallaxStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: parallaxFor(combined.value.rotateY, maxDeg, parallaxPx) },
      { translateY: parallaxFor(combined.value.rotateX, maxDeg, parallaxPx) },
    ],
  }));

  const sheenStyle = useAnimatedStyle(() => ({
    opacity: sheenOpacityFor(combined.value, maxDeg, peak),
    transform: [
      { translateX: sheenFor(combined.value.rotateY, maxDeg, SHEEN_SHIFT) },
      { translateY: sheenFor(combined.value.rotateX, maxDeg, SHEEN_SHIFT) },
    ],
  }));

  const onLayout = (event: LayoutChangeEvent) => {
    sizeSV.value = event.nativeEvent.layout.width;
  };

  return (
    <GestureDetector gesture={pan}>
      <Animated.View style={[style, styles.card, cardStyle]} onLayout={onLayout}>
        <Animated.View style={[StyleSheet.absoluteFill, styles.center, parallaxStyle]}>
          <Image
            source={{ uri }}
            style={styles.image}
            resizeMode="contain"
            accessibilityLabel={accessibilityLabel}
          />
        </Animated.View>
        {/* Decorative specular sheen — bleeds past the frame so it can slide
            without exposing an edge; the card clips the excess. Hidden from a11y. */}
        <Animated.View
          pointerEvents="none"
          accessibilityElementsHidden
          importantForAccessibility="no"
          style={[styles.sheen, sheenStyle]}
        >
          <LinearGradient
            colors={[sheen.from, sheen.to]}
            start={SHEEN_START}
            end={SHEEN_END}
            style={StyleSheet.absoluteFill}
          />
        </Animated.View>
      </Animated.View>
    </GestureDetector>
  );
}

// 135° specular wash: top-left → bottom-right (matches the web tile + CutoutTile).
const SHEEN_START = { x: 0, y: 0 } as const;
const SHEEN_END = { x: 1, y: 1 } as const;

// The sheen bleeds one base unit past every edge so a slide never uncovers a
// corner; the card's overflow clips it back.
const SHEEN_BLEED = spacing.s4;

const styles = StyleSheet.create({
  card: {
    overflow: 'hidden',
  },
  center: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  sheen: {
    position: 'absolute',
    top: -SHEEN_BLEED,
    left: -SHEEN_BLEED,
    right: -SHEEN_BLEED,
    bottom: -SHEEN_BLEED,
  },
});
