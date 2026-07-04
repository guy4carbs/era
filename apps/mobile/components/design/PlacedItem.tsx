/**
 * PlacedItem — one item on the outfit canvas, driven by native gestures.
 *
 * The real mobile advantage: a placed piece responds to a simultaneous PAN
 * (drag → normalized posX/posY), PINCH (→ scale, clamped to the contract), and
 * ROTATION (→ rotation degrees). A stationary tap selects it. All three continuous
 * gestures run together via `Gesture.Simultaneous`; a `Gesture.Race` lets a quick
 * tap select without starting a drag.
 *
 * SNAPPING: while panning, the item's centre snaps to the stage centre-line (x
 * and y independently) once within {@link SNAP_THRESHOLD_PX}. On snap-engage it
 * raises the shared guide value (the canvas draws a faint accent line) and fires a
 * selection haptic tick. Reduced motion keeps snapping and keeps the drag direct;
 * it only swaps the release spring for a short timing settle.
 *
 * The component seeds its shared values from the placement once (on mount), then
 * commits back to the parent on gesture end — so parent state stays the source of
 * truth for saving and never fights an in-flight gesture.
 */
import { glass, radii } from '@era/tokens';
import * as Haptics from 'expo-haptics';
import { useEffect, useMemo } from 'react';
import { StyleSheet } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

import { springFromToken } from '@/lib/motion';
import { useTheme } from '@/lib/theme';

import {
  BASE_ITEM_FRACTION,
  CENTER,
  ROTATION_MAX,
  ROTATION_MIN,
  SCALE_MAX,
  SCALE_MIN,
  SNAP_THRESHOLD_PX,
} from './constants';
import type { OutfitItemTransform } from './api';

const RAD_TO_DEG = 180 / Math.PI;
const REDUCED_FADE_MS = 150;

/** A snap target: another piece's normalized center, or the stage center-line. */
interface SnapTarget {
  readonly posX: number;
  readonly posY: number;
}

/** A placement plus the resolved image the canvas paints. */
export interface Placement extends OutfitItemTransform {
  readonly displayUrl: string | null;
  readonly name: string;
}

interface PlacedItemProps {
  readonly placement: Placement;
  /** Live stage size in px — gesture math converts px ↔ normalized against it. */
  readonly stage: { readonly w: number; readonly h: number };
  readonly selected: boolean;
  readonly reduced: boolean;
  readonly onSelect: (itemId: string) => void;
  /** Commit the final transform to parent state on gesture end. */
  readonly onCommit: (itemId: string, next: OutfitItemTransform) => void;
  /**
   * The OTHER placed pieces' normalized centres (this one excluded). The dragged
   * piece's centre snaps to any of these as well as the stage centre-line.
   */
  readonly others: readonly SnapTarget[];
  /** Canvas-owned guide visibility (0..1) for each axis' guide overlay. */
  readonly guideX: SharedValue<number>;
  readonly guideY: SharedValue<number>;
  /** Canvas-owned guide position (normalized 0..1) — where each guide draws. */
  readonly guideXPos: SharedValue<number>;
  readonly guideYPos: SharedValue<number>;
}

function clampWorklet(value: number, lo: number, hi: number): number {
  'worklet';
  return Math.min(hi, Math.max(lo, value));
}

/**
 * The nearest target (as a normalized position) whose centre is within
 * `thresholdPx` of `valuePx`, or null. Mirrors the web `nearest` in
 * `snapping.ts`: targets and the value are compared in px on one axis.
 */
function nearestSnapWorklet(
  valuePx: number,
  targetsNorm: readonly number[],
  sizePx: number,
  thresholdPx: number,
): number | null {
  'worklet';
  let bestNorm: number | null = null;
  let bestDist = thresholdPx;
  for (const t of targetsNorm) {
    const dist = Math.abs(valuePx - t * sizePx);
    if (dist <= bestDist) {
      bestDist = dist;
      bestNorm = t;
    }
  }
  return bestNorm;
}

export function PlacedItem({
  placement,
  stage,
  selected,
  reduced,
  onSelect,
  onCommit,
  others,
  guideX,
  guideY,
  guideXPos,
  guideYPos,
}: PlacedItemProps) {
  const { colors } = useTheme();

  // Seeded once from the placement; the gesture drives these directly and the
  // parent is updated on release. Reopen/add mounts fresh with correct seeds.
  const posX = useSharedValue(placement.posX);
  const posY = useSharedValue(placement.posY);
  const scale = useSharedValue(placement.scale);
  const rotation = useSharedValue(placement.rotation);

  const startX = useSharedValue(0);
  const startY = useSharedValue(0);
  const startScale = useSharedValue(0);
  const startRot = useSharedValue(0);
  // Edge-detect snap engage per axis so the haptic fires once, not every frame.
  const wasSnapX = useSharedValue(false);
  const wasSnapY = useSharedValue(false);
  // The normalized target each axis last snapped to, so the tick re-fires when
  // the finger crosses from one piece's centre to another's (not just on/off).
  const snapTargetX = useSharedValue(-1);
  const snapTargetY = useSharedValue(-1);

  // Bridge the other pieces' centres (JS array) to the UI thread. Snapshotted at
  // gesture start — pieces don't move while THIS one is dragged, so it stays
  // valid for the whole gesture.
  const othersShared = useSharedValue<readonly SnapTarget[]>(others);
  const startOthers = useSharedValue<readonly SnapTarget[]>([]);
  useEffect(() => {
    othersShared.value = others;
  }, [others, othersShared]);

  const itemId = placement.itemId;

  const tick = () => {
    void Haptics.selectionAsync();
  };
  const commit = () => {
    onCommit(itemId, {
      itemId,
      layerOrder: placement.layerOrder,
      posX: posX.value,
      posY: posY.value,
      scale: scale.value,
      rotation: rotation.value,
    });
  };
  const select = () => onSelect(itemId);

  // Recreate the composed gesture when the stage or reduced-motion flag changes,
  // so the worklets capture fresh values.
  const gesture = useMemo(() => {
    // Non-reduced: ease into the snap line with a fluid spring. Reduced: a short
    // timing fade. Direct tracking (below) is unchanged either way.
    const settle = (to: number) => {
      'worklet';
      return reduced
        ? withTiming(to, { duration: REDUCED_FADE_MS })
        : withSpring(to, springFromToken('fluid'));
    };

    const pan = Gesture.Pan()
      .onStart(() => {
        startX.value = posX.value;
        startY.value = posY.value;
        wasSnapX.value = false;
        wasSnapY.value = false;
        snapTargetX.value = -1;
        snapTargetY.value = -1;
        // Freeze the other pieces' centres for the life of this drag.
        startOthers.value = othersShared.value;
        runOnJS(select)();
      })
      .onUpdate((event) => {
        if (stage.w <= 0 || stage.h <= 0) {
          return;
        }
        // Proposed centre in px, then snapped to the stage centre-line AND to
        // every other piece's centre, per axis (mirrors web `applySnap`).
        const cx = startX.value * stage.w + event.translationX;
        const cy = startY.value * stage.h + event.translationY;

        const xTargets: number[] = [CENTER];
        const yTargets: number[] = [CENTER];
        for (const o of startOthers.value) {
          xTargets.push(o.posX);
          yTargets.push(o.posY);
        }
        const snapXNorm = nearestSnapWorklet(cx, xTargets, stage.w, SNAP_THRESHOLD_PX);
        const snapYNorm = nearestSnapWorklet(cy, yTargets, stage.h, SNAP_THRESHOLD_PX);

        // On snap-engage (or a jump to a new target), ease onto the guide once and
        // tick; while held on the same target, hold. Off it, track the finger.
        if (snapXNorm !== null) {
          if (!wasSnapX.value || snapTargetX.value !== snapXNorm) {
            posX.value = settle(snapXNorm);
            snapTargetX.value = snapXNorm;
            runOnJS(tick)();
          }
          guideXPos.value = snapXNorm;
          guideX.value = 1;
        } else {
          posX.value = clampWorklet(cx / stage.w, 0, 1);
          guideX.value = 0;
        }
        if (snapYNorm !== null) {
          if (!wasSnapY.value || snapTargetY.value !== snapYNorm) {
            posY.value = settle(snapYNorm);
            snapTargetY.value = snapYNorm;
            runOnJS(tick)();
          }
          guideYPos.value = snapYNorm;
          guideY.value = 1;
        } else {
          posY.value = clampWorklet(cy / stage.h, 0, 1);
          guideY.value = 0;
        }

        wasSnapX.value = snapXNorm !== null;
        wasSnapY.value = snapYNorm !== null;
      })
      .onEnd(() => {
        guideX.value = 0;
        guideY.value = 0;
        runOnJS(commit)();
      });

    const pinch = Gesture.Pinch()
      .onStart(() => {
        startScale.value = scale.value;
        runOnJS(select)();
      })
      .onUpdate((event) => {
        scale.value = clampWorklet(startScale.value * event.scale, SCALE_MIN, SCALE_MAX);
      })
      .onEnd(() => {
        // Snap out of the spring's overshoot range isn't needed — value is clamped.
        runOnJS(commit)();
      });

    const rotate = Gesture.Rotation()
      .onStart(() => {
        startRot.value = rotation.value;
        runOnJS(select)();
      })
      .onUpdate((event) => {
        rotation.value = clampWorklet(
          startRot.value + event.rotation * RAD_TO_DEG,
          ROTATION_MIN,
          ROTATION_MAX,
        );
      })
      .onEnd(() => {
        runOnJS(commit)();
      });

    const tap = Gesture.Tap().onEnd(() => {
      runOnJS(select)();
    });

    // A stationary tap selects; any movement runs the three continuous gestures
    // together (native pinch + rotate + drag).
    return Gesture.Race(tap, Gesture.Simultaneous(pan, pinch, rotate));
    // Shared values and the JS callbacks are stable refs; the worklets only need
    // to recapture on a stage resize or a reduced-motion toggle.
  }, [stage.w, stage.h, reduced]);

  const base = stage.w * BASE_ITEM_FRACTION;

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: posX.value * stage.w - base / 2 },
      { translateY: posY.value * stage.h - base / 2 },
      { scale: scale.value },
      { rotate: `${rotation.value}deg` },
    ],
  }));

  return (
    <GestureDetector gesture={gesture}>
      <Animated.View
        accessibilityRole="imagebutton"
        accessibilityLabel={placement.name}
        accessibilityState={{ selected }}
        style={[
          styles.box,
          {
            width: base,
            height: base,
            borderRadius: radii.card,
            borderWidth: selected ? glass.borderWidth : 0,
            borderColor: colors.accent,
            backgroundColor: selected ? `${colors.accent}1F` : 'transparent',
          },
          animatedStyle,
        ]}
      >
        {placement.displayUrl ? (
          <Animated.Image
            source={{ uri: placement.displayUrl }}
            style={styles.image}
            resizeMode="contain"
            accessible={false}
          />
        ) : null}
      </Animated.View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  box: {
    position: 'absolute',
    top: 0,
    left: 0,
    borderCurve: 'continuous',
  },
  image: {
    flex: 1,
    width: '100%',
  },
});
