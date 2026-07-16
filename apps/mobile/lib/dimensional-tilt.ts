/**
 * dimensional-tilt — worklet-safe pure math for the 2.5D item hero.
 *
 * Ports the web GalleryTile grammar (tilt up to `motion.tilt.maxDeg`, a cutout
 * that floats against the tilt, a specular sheen that slides opposite the cutout)
 * to a gyroscope + touch-drag driven hero. Kept as plain, side-effect-free
 * functions so they run inside a Reanimated frame callback / gesture worklet AND
 * inside a plain Node test with no React Native in scope.
 *
 * The token values (max tilt degrees, parallax px) are passed IN by the caller —
 * this module never reaches for `@era/tokens`, so web and mobile keep one source
 * of truth while the math stays dependency-free and testable.
 *
 * Sign grammar (matches the web tile's relationships):
 *   - the cutout parallax floats AGAINST the tilt (`parallaxFor` negates),
 *   - the sheen slides WITH the tilt — i.e. opposite the cutout (`sheenFor` does
 *     not), so the two counter-move for the premium floating-glass read.
 */

/** A tilt pose in degrees: rotation about each screen axis. */
export interface Tilt {
  /** Rotation about the X axis (deg) — driven by pitch / vertical drag. */
  readonly rotateX: number;
  /** Rotation about the Y axis (deg) — driven by roll / horizontal drag. */
  readonly rotateY: number;
}

/** Symmetric clamp to ±`limit`, normalising a `-0` result to `0`. */
function clampAbs(value: number, limit: number): number {
  'worklet';
  const clamped = Math.min(limit, Math.max(-limit, value));
  return clamped === 0 ? 0 : clamped;
}

/**
 * Phone rotation from the baseline (radians) that maps to the full ± tilt range.
 * ~0.4 rad (~23°) of wrist tilt reaches max — beyond that the tilt saturates, so
 * a normal hand-hold gives a lively-but-contained lean, never a fold.
 */
const SENSOR_RANGE_RAD = 0.4;

/**
 * One low-pass step for the rolling neutral pose. The baseline is where the user
 * currently holds the phone (not absolute gravity), so the card sits flat at rest
 * however the phone is angled; it drifts slowly toward the live reading (`alpha`
 * per frame, e.g. 0.02). Callers freeze this — skip the step — while dragging.
 */
export function driftBaseline(baseline: number, reading: number, alpha: number): number {
  'worklet';
  return baseline + (reading - baseline) * alpha;
}

/**
 * Gyro tilt: the sensor delta from baseline (radians) mapped to ± max tilt
 * degrees and clamped. Zero delta → flat; symmetric about zero.
 */
export function tiltFromDelta(deltaPitch: number, deltaRoll: number, maxDeg: number): Tilt {
  'worklet';
  return {
    rotateX: clampAbs((deltaPitch / SENSOR_RANGE_RAD) * maxDeg, maxDeg),
    rotateY: clampAbs((deltaRoll / SENSOR_RANGE_RAD) * maxDeg, maxDeg),
  };
}

/**
 * Drag tilt: pan translation mapped across the hero's size to tilt degrees — a
 * full-width/height drag (`size`) reaches max tilt. Dragging right tilts about Y;
 * dragging down tilts about X the opposite way (top leans toward the finger),
 * matching the web pointer mapping. Clamped, and a zero/negative size is inert.
 */
export function dragTilt(dx: number, dy: number, size: number, maxDeg: number): Tilt {
  'worklet';
  if (size <= 0) return { rotateX: 0, rotateY: 0 };
  return {
    rotateX: clampAbs((-dy / size) * maxDeg, maxDeg),
    rotateY: clampAbs((dx / size) * maxDeg, maxDeg),
  };
}

/** Sum the gyro and drag poses, clamped back to ± max tilt. */
export function combineTilt(gyro: Tilt, drag: Tilt, maxDeg: number): Tilt {
  'worklet';
  return {
    rotateX: clampAbs(gyro.rotateX + drag.rotateX, maxDeg),
    rotateY: clampAbs(gyro.rotateY + drag.rotateY, maxDeg),
  };
}

/**
 * Cutout parallax offset (px) for a tilt-axis degree: floats AGAINST the tilt
 * (negated), scaled so full tilt reaches `maxPx`. Clamped for safety.
 */
export function parallaxFor(tiltDeg: number, maxDeg: number, maxPx: number): number {
  'worklet';
  if (maxDeg <= 0) return 0;
  return clampAbs(-(tiltDeg / maxDeg) * maxPx, maxPx);
}

/**
 * Sheen translate offset (px) for a tilt-axis degree: slides WITH the tilt (the
 * opposite direction to the cutout), scaled so full tilt reaches `maxPx`.
 */
export function sheenFor(tiltDeg: number, maxDeg: number, maxPx: number): number {
  'worklet';
  if (maxDeg <= 0) return 0;
  return clampAbs((tiltDeg / maxDeg) * maxPx, maxPx);
}

/**
 * Sheen band opacity: 0 at rest (the hero must look exactly like the flat static
 * image when untouched), ramping toward `peak` as the combined tilt magnitude
 * nears max. Normalised by `maxDeg` and capped at 1 before scaling.
 */
export function sheenOpacityFor(tilt: Tilt, maxDeg: number, peak: number): number {
  'worklet';
  if (maxDeg <= 0) return 0;
  const magnitude = Math.sqrt(tilt.rotateX * tilt.rotateX + tilt.rotateY * tilt.rotateY);
  return Math.min(1, magnitude / maxDeg) * peak;
}
