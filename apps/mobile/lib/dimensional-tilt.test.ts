import assert from 'node:assert/strict';
import test from 'node:test';

import {
  combineTilt,
  dragTilt,
  driftBaseline,
  parallaxFor,
  sheenFor,
  sheenOpacityFor,
  tiltFromDelta,
  type Tilt,
} from './dimensional-tilt.ts';

// The real callers pass the motion tokens (maxDeg 7, parallaxPx 6); the math is
// token-agnostic, so the tests pin the same numbers directly.
const MAX_DEG = 7;
const MAX_PX = 6;

test('driftBaseline low-passes toward the reading', () => {
  // alpha 0 holds; alpha 1 snaps; a fraction moves proportionally.
  assert.equal(driftBaseline(0, 1, 0), 0);
  assert.equal(driftBaseline(0, 1, 1), 1);
  assert.equal(driftBaseline(0, 1, 0.25), 0.25);
  assert.equal(driftBaseline(2, 2, 0.02), 2); // already at the reading — no drift
  // Repeated small steps converge, never overshoot.
  let b = 0;
  for (let i = 0; i < 500; i += 1) b = driftBaseline(b, 1, 0.02);
  assert.ok(b > 0.99 && b <= 1, `converged near reading, got ${b}`);
});

test('tiltFromDelta: zero delta is flat', () => {
  assert.deepEqual(tiltFromDelta(0, 0, MAX_DEG), { rotateX: 0, rotateY: 0 });
});

test('tiltFromDelta clamps large sensor deltas to ± maxDeg', () => {
  assert.deepEqual(tiltFromDelta(10, 10, MAX_DEG), { rotateX: MAX_DEG, rotateY: MAX_DEG });
  assert.deepEqual(tiltFromDelta(-10, -10, MAX_DEG), { rotateX: -MAX_DEG, rotateY: -MAX_DEG });
});

test('tiltFromDelta is symmetric about zero', () => {
  const pos = tiltFromDelta(0.1, 0.2, MAX_DEG);
  const neg = tiltFromDelta(-0.1, -0.2, MAX_DEG);
  assert.equal(neg.rotateX, -pos.rotateX);
  assert.equal(neg.rotateY, -pos.rotateY);
});

test('dragTilt maps a full-size drag to max tilt, clamped', () => {
  const size = 300;
  // Full-width drag right → +maxDeg about Y; full-height drag down → -maxDeg about X.
  assert.deepEqual(dragTilt(size, 0, size, MAX_DEG), { rotateX: 0, rotateY: MAX_DEG });
  assert.deepEqual(dragTilt(0, size, size, MAX_DEG), { rotateX: -MAX_DEG, rotateY: 0 });
  // Past the edge stays clamped.
  assert.deepEqual(dragTilt(size * 3, -size * 3, size, MAX_DEG), {
    rotateX: MAX_DEG,
    rotateY: MAX_DEG,
  });
  // Half a drag is half the tilt.
  assert.deepEqual(dragTilt(size / 2, 0, size, MAX_DEG), { rotateX: 0, rotateY: MAX_DEG / 2 });
});

test('dragTilt is inert with a zero/negative size (pre-layout)', () => {
  assert.deepEqual(dragTilt(50, 50, 0, MAX_DEG), { rotateX: 0, rotateY: 0 });
  assert.deepEqual(dragTilt(50, 50, -10, MAX_DEG), { rotateX: 0, rotateY: 0 });
});

test('combineTilt sums the poses and clamps back to ± maxDeg', () => {
  const gyro: Tilt = { rotateX: 3, rotateY: -2 };
  const drag: Tilt = { rotateX: 2, rotateY: -1 };
  assert.deepEqual(combineTilt(gyro, drag, MAX_DEG), { rotateX: 5, rotateY: -3 });
  // Overflow saturates, both signs.
  assert.deepEqual(
    combineTilt({ rotateX: 6, rotateY: -6 }, { rotateX: 6, rotateY: -6 }, MAX_DEG),
    { rotateX: MAX_DEG, rotateY: -MAX_DEG },
  );
  // Two zero poses stay flat.
  assert.deepEqual(
    combineTilt({ rotateX: 0, rotateY: 0 }, { rotateX: 0, rotateY: 0 }, MAX_DEG),
    { rotateX: 0, rotateY: 0 },
  );
});

test('parallaxFor floats against the tilt, sheenFor with it (opposite signs)', () => {
  // At full tilt they reach ±maxPx in opposite directions.
  assert.equal(parallaxFor(MAX_DEG, MAX_DEG, MAX_PX), -MAX_PX);
  assert.equal(sheenFor(MAX_DEG, MAX_DEG, MAX_PX), MAX_PX);
  assert.equal(parallaxFor(-MAX_DEG, MAX_DEG, MAX_PX), MAX_PX);
  assert.equal(sheenFor(-MAX_DEG, MAX_DEG, MAX_PX), -MAX_PX);
  // Rest is zero offset for both.
  assert.equal(parallaxFor(0, MAX_DEG, MAX_PX), 0);
  assert.equal(sheenFor(0, MAX_DEG, MAX_PX), 0);
});

test('parallaxFor / sheenFor are symmetric and clamp beyond max', () => {
  assert.equal(parallaxFor(MAX_DEG / 2, MAX_DEG, MAX_PX), -MAX_PX / 2);
  assert.equal(sheenFor(MAX_DEG / 2, MAX_DEG, MAX_PX), MAX_PX / 2);
  // A tilt past maxDeg (shouldn't happen post-clamp, but guard holds) saturates.
  assert.equal(parallaxFor(MAX_DEG * 2, MAX_DEG, MAX_PX), -MAX_PX);
  assert.equal(sheenFor(MAX_DEG * 2, MAX_DEG, MAX_PX), MAX_PX);
  // A degenerate maxDeg is inert, never divides by zero.
  assert.equal(parallaxFor(3, 0, MAX_PX), 0);
  assert.equal(sheenFor(3, 0, MAX_PX), 0);
});

test('sheenOpacityFor is 0 at rest and ramps to peak by magnitude', () => {
  const peak = 0.6;
  assert.equal(sheenOpacityFor({ rotateX: 0, rotateY: 0 }, MAX_DEG, peak), 0);
  // A single-axis max reaches peak.
  assert.equal(sheenOpacityFor({ rotateX: MAX_DEG, rotateY: 0 }, MAX_DEG, peak), peak);
  // Both axes at max → magnitude exceeds maxDeg but is capped at peak, not beyond.
  assert.equal(sheenOpacityFor({ rotateX: MAX_DEG, rotateY: MAX_DEG }, MAX_DEG, peak), peak);
  // Sign of the tilt doesn't matter — magnitude only.
  assert.equal(
    sheenOpacityFor({ rotateX: -MAX_DEG, rotateY: 0 }, MAX_DEG, peak),
    sheenOpacityFor({ rotateX: MAX_DEG, rotateY: 0 }, MAX_DEG, peak),
  );
  // Half magnitude on one axis is half peak.
  assert.equal(sheenOpacityFor({ rotateX: MAX_DEG / 2, rotateY: 0 }, MAX_DEG, peak), peak / 2);
  // Degenerate maxDeg is inert.
  assert.equal(sheenOpacityFor({ rotateX: 3, rotateY: 3 }, 0, peak), 0);
});
