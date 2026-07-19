/**
 * TiltField — a device-tilt field shared across a screen of {@link ItemSurface}s.
 *
 * Progressive enhancement for the closet grid: mount ONE `TiltFieldProvider`
 * around the grid and every surface that reads `useTiltField()` breathes with
 * the wrist together — a subtle, half-strength version of the item hero's tilt.
 * The touched tile's own drag-tilt (full strength, in the CutoutTile wrapper)
 * sums on top of this drift.
 *
 * One sensor for the whole field: the provider owns a single
 * `useAnimatedSensor(ROTATION, {interval:16})` with the rolling-baseline +
 * deadzone pipeline reused from `lib/dimensional-tilt.ts` (same constants as the
 * hero), and derives a shared `TiltFieldValue` at HALF amplitude (`maxDeg/2`,
 * `parallaxPx/2`). Every surface reads that one value — no per-surface sensor.
 *
 * Hard rules (each a lesson already paid for in this repo):
 *   - STATIC-FIRST: the sensor tree mounts only once `useReducedMotionSafe` has
 *     resolved to motion-allowed (the same one-tick `motionKnownOk` gate the
 *     hero uses); until then, and forever under reduced motion, the field value
 *     is a frozen zero pose — surfaces render flat.
 *   - FOCUS-GATED: the caller passes `active` (wired to `useFocusEffect` on the
 *     closet screen). A blurred screen — or a mounted-but-offscreen one — sets
 *     the sensor tree out of the tree entirely, so the gyro stops. Unmount alone
 *     never fires here (tab screens stay mounted), so the explicit gate is the
 *     only thing that stops the subscription.
 *   - ZERO per-frame JS: all math runs in the frame-callback / derived worklets.
 *   - GRACEFUL no-op: a sensor-less device (simulator, cheap Android) reads a
 *     constant zero, so the field simply contributes nothing — no special-casing.
 */
import { motion } from '@era/tokens';
import { createContext, useContext, useEffect, useState, type PropsWithChildren } from 'react';
import { AccessibilityInfo } from 'react-native';
import {
  SensorType,
  useAnimatedSensor,
  useDerivedValue,
  useSharedValue,
  type SharedValue,
} from 'react-native-reanimated';

import { useReducedMotionSafe } from '@/lib/motion';
import { driftBaseline, tiltFromDelta } from '@/lib/dimensional-tilt';
import type { TiltFieldValue } from './ItemSurface';

const { maxDeg, parallaxPx } = motion.tilt;

// HALF amplitude — a field of cards should whisper, not lean. The touched tile's
// full-strength drag-tilt is what actually reads; this is ambient life beneath it.
const FIELD_MAX_DEG = maxDeg / 2;
const FIELD_PARALLAX_PX = parallaxPx / 2;

// Low-pass factor for the rolling baseline: ~2% per frame drifts the neutral
// pose toward how the phone is now held over ~a second — the same value the hero
// uses, slow enough it never chases an intentional tilt.
const BASELINE_ALPHA = 0.02;

const FLAT: TiltFieldValue = { rotateX: 0, rotateY: 0, parallaxX: 0, parallaxY: 0 };

const TiltFieldContext = createContext<SharedValue<TiltFieldValue> | null>(null);

/**
 * Read the shared field pose. Returns `undefined` when no provider is mounted
 * (or the field is inert), so a surface can pass it straight to `tiltField`
 * without caring whether the enhancement is active.
 */
export function useTiltField(): SharedValue<TiltFieldValue> | undefined {
  return useContext(TiltFieldContext) ?? undefined;
}

interface TiltFieldProviderProps {
  /** True only while the hosting screen is focused (wire to useFocusEffect). */
  readonly active: boolean;
}

export function TiltFieldProvider({ active, children }: PropsWithChildren<TiltFieldProviderProps>) {
  const reduced = useReducedMotionSafe();

  // Static-first: the sensor tree may only mount once the OS setting resolves to
  // "motion allowed". useReducedMotionSafe defaults to false while its async read
  // is in flight, which would briefly mount the sensor even for reduced-motion
  // users; this one-tick gate closes that window.
  const [motionKnownOk, setMotionKnownOk] = useState(false);
  useEffect(() => {
    let live = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((value) => {
      if (live && !value) setMotionKnownOk(true);
    });
    return () => {
      live = false;
    };
  }, []);

  const inert = reduced || !motionKnownOk || !active;

  // A single frozen-zero shared value backs the whole field when inert (no
  // sensor mounted). The live provider swaps in its own sensor-driven value.
  const flat = useSharedValue<TiltFieldValue>(FLAT);

  if (inert) {
    return <TiltFieldContext.Provider value={flat}>{children}</TiltFieldContext.Provider>;
  }

  return <ActiveTiltField>{children}</ActiveTiltField>;
}

function ActiveTiltField({ children }: PropsWithChildren) {
  // Rotation sensor at ~60Hz (interval 16ms) — deliberately under Android 12's
  // 200Hz HIGH_SAMPLING_RATE_SENSORS threshold so neither platform prompts for a
  // permission; iOS never requires one for device-motion at this rate.
  const { sensor } = useAnimatedSensor(SensorType.ROTATION, { interval: 16 });

  // Rolling neutral pose (radians) the field tilt is measured against.
  const basePitch = useSharedValue(0);
  const baseRoll = useSharedValue(0);
  const baselineReady = useSharedValue(false);

  // The derived field pose every surface reads. Seeds the baseline on the first
  // reading, then drifts it slowly toward the live pose, and maps the delta to a
  // HALF-amplitude tilt + a matching parallax. A sensor-less device reads zero,
  // so the pose stays flat. All on the UI thread — zero per-frame JS.
  const field = useDerivedValue<TiltFieldValue>(() => {
    const r = sensor.value;
    if (!baselineReady.value) {
      basePitch.value = r.pitch;
      baseRoll.value = r.roll;
      baselineReady.value = true;
      return FLAT;
    }
    basePitch.value = driftBaseline(basePitch.value, r.pitch, BASELINE_ALPHA);
    baseRoll.value = driftBaseline(baseRoll.value, r.roll, BASELINE_ALPHA);

    const tilt = tiltFromDelta(r.pitch - basePitch.value, r.roll - baseRoll.value, FIELD_MAX_DEG);
    // Parallax floats AGAINST the tilt, scaled to the field's half parallax —
    // rotateY drives the horizontal shift, rotateX the vertical (matching the
    // hero's parallaxFor grammar, kept inline so this stays one worklet).
    return {
      rotateX: tilt.rotateX,
      rotateY: tilt.rotateY,
      parallaxX: -(tilt.rotateY / FIELD_MAX_DEG) * FIELD_PARALLAX_PX,
      parallaxY: -(tilt.rotateX / FIELD_MAX_DEG) * FIELD_PARALLAX_PX,
    };
  });

  return <TiltFieldContext.Provider value={field}>{children}</TiltFieldContext.Provider>;
}
