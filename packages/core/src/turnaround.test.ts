/**
 * Unit tests for the turnaround wire contract, QA gate, and generation prompts.
 *
 * The QA gate ({@link isRenderAcceptable}) is covered exhaustively: all 24
 * combinations of the four verdict fields, each with a hand-checked expected
 * outcome, so the accept rule (same garment AND right angle AND no major
 * artifact, plus the dirty-background-only-passes-when-flawless nuance) is pinned
 * against regression. The prompt helpers are asserted for exact, reviewable copy.
 *
 * Run: node --experimental-strip-types --test src/turnaround.test.ts
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  TURNAROUND_ANGLES,
  TURNAROUND_PROMPT_PREAMBLE,
  TURNAROUND_ANGLE_INSTRUCTIONS,
  anglePrompt,
  isRenderAcceptable,
  type TurnaroundAngle,
  type TurnaroundVerdict,
} from './turnaround.ts';

type Severity = TurnaroundVerdict['artifactSeverity'];

/**
 * The full truth table for {@link isRenderAcceptable}: every combination of the
 * four verdict fields with an independently hand-checked `expected`. Reading the
 * rule off this table: a render is accepted only when it is the same garment, from
 * the right angle, with no major artifact — and its background is either clean OR
 * (if not) the render is otherwise flawless (`none` artifacts).
 */
const SEVERITIES: readonly Severity[] = ['none', 'minor', 'major'];
const cases: ReadonlyArray<{
  sameGarment: boolean;
  angleMatches: boolean;
  cleanBackground: boolean;
  artifactSeverity: Severity;
  expected: boolean;
}> = [
  // same garment + right angle + clean background: passes unless artifact is major
  { sameGarment: true, angleMatches: true, cleanBackground: true, artifactSeverity: 'none', expected: true },
  { sameGarment: true, angleMatches: true, cleanBackground: true, artifactSeverity: 'minor', expected: true },
  { sameGarment: true, angleMatches: true, cleanBackground: true, artifactSeverity: 'major', expected: false },
  // same garment + right angle + dirty background: passes ONLY when otherwise flawless
  { sameGarment: true, angleMatches: true, cleanBackground: false, artifactSeverity: 'none', expected: true },
  { sameGarment: true, angleMatches: true, cleanBackground: false, artifactSeverity: 'minor', expected: false },
  { sameGarment: true, angleMatches: true, cleanBackground: false, artifactSeverity: 'major', expected: false },
  // right angle but WRONG garment: always rejected, no matter how clean
  { sameGarment: false, angleMatches: true, cleanBackground: true, artifactSeverity: 'none', expected: false },
  { sameGarment: false, angleMatches: true, cleanBackground: true, artifactSeverity: 'minor', expected: false },
  { sameGarment: false, angleMatches: true, cleanBackground: true, artifactSeverity: 'major', expected: false },
  { sameGarment: false, angleMatches: true, cleanBackground: false, artifactSeverity: 'none', expected: false },
  { sameGarment: false, angleMatches: true, cleanBackground: false, artifactSeverity: 'minor', expected: false },
  { sameGarment: false, angleMatches: true, cleanBackground: false, artifactSeverity: 'major', expected: false },
  // same garment but WRONG angle: always rejected
  { sameGarment: true, angleMatches: false, cleanBackground: true, artifactSeverity: 'none', expected: false },
  { sameGarment: true, angleMatches: false, cleanBackground: true, artifactSeverity: 'minor', expected: false },
  { sameGarment: true, angleMatches: false, cleanBackground: true, artifactSeverity: 'major', expected: false },
  { sameGarment: true, angleMatches: false, cleanBackground: false, artifactSeverity: 'none', expected: false },
  { sameGarment: true, angleMatches: false, cleanBackground: false, artifactSeverity: 'minor', expected: false },
  { sameGarment: true, angleMatches: false, cleanBackground: false, artifactSeverity: 'major', expected: false },
  // wrong garment AND wrong angle: always rejected
  { sameGarment: false, angleMatches: false, cleanBackground: true, artifactSeverity: 'none', expected: false },
  { sameGarment: false, angleMatches: false, cleanBackground: true, artifactSeverity: 'minor', expected: false },
  { sameGarment: false, angleMatches: false, cleanBackground: true, artifactSeverity: 'major', expected: false },
  { sameGarment: false, angleMatches: false, cleanBackground: false, artifactSeverity: 'none', expected: false },
  { sameGarment: false, angleMatches: false, cleanBackground: false, artifactSeverity: 'minor', expected: false },
  { sameGarment: false, angleMatches: false, cleanBackground: false, artifactSeverity: 'major', expected: false },
];

test('isRenderAcceptable covers every verdict combination', () => {
  // Guard: the table is genuinely exhaustive (2 × 2 × 2 × 3 = 24 rows).
  assert.equal(cases.length, 2 * 2 * 2 * SEVERITIES.length);
  for (const c of cases) {
    const verdict: TurnaroundVerdict = {
      sameGarment: c.sameGarment,
      angleMatches: c.angleMatches,
      cleanBackground: c.cleanBackground,
      artifactSeverity: c.artifactSeverity,
    };
    assert.equal(
      isRenderAcceptable(verdict),
      c.expected,
      `verdict ${JSON.stringify(verdict)} should be ${c.expected}`,
    );
  }
});

test('isRenderAcceptable: the clean flawless render passes', () => {
  assert.equal(
    isRenderAcceptable({
      sameGarment: true,
      angleMatches: true,
      cleanBackground: true,
      artifactSeverity: 'none',
    }),
    true,
  );
});

test('isRenderAcceptable: a dirty background alone (zero artifacts) still passes', () => {
  assert.equal(
    isRenderAcceptable({
      sameGarment: true,
      angleMatches: true,
      cleanBackground: false,
      artifactSeverity: 'none',
    }),
    true,
  );
});

test('isRenderAcceptable: dirty background plus a minor artifact rejects', () => {
  assert.equal(
    isRenderAcceptable({
      sameGarment: true,
      angleMatches: true,
      cleanBackground: false,
      artifactSeverity: 'minor',
    }),
    false,
  );
});

test('isRenderAcceptable: a major artifact rejects even with everything else clean', () => {
  assert.equal(
    isRenderAcceptable({
      sameGarment: true,
      angleMatches: true,
      cleanBackground: true,
      artifactSeverity: 'major',
    }),
    false,
  );
});

test('TURNAROUND_ANGLES is the three expected viewpoints in order', () => {
  assert.deepEqual([...TURNAROUND_ANGLES], ['three_quarter', 'side', 'back']);
});

test('anglePrompt composes the shared preamble with each angle instruction', () => {
  for (const angle of TURNAROUND_ANGLES) {
    const prompt = anglePrompt(angle);
    assert.equal(prompt, `${TURNAROUND_PROMPT_PREAMBLE} ${TURNAROUND_ANGLE_INSTRUCTIONS[angle]}`);
    assert.ok(prompt.startsWith(TURNAROUND_PROMPT_PREAMBLE));
    assert.ok(prompt.includes(TURNAROUND_ANGLE_INSTRUCTIONS[angle]));
  }
});

test('the generation prompt pins the trust-critical instructions', () => {
  // Same-piece fidelity and a person-free plain-white product shot are the
  // load-bearing constraints — assert they are literally present.
  const preamble = TURNAROUND_PROMPT_PREAMBLE.toLowerCase();
  assert.ok(preamble.includes('exact same'));
  assert.ok(preamble.includes('identical item'));
  assert.ok(preamble.includes('color, pattern, material, and proportions'));
  assert.ok(preamble.includes('plain white background'));
  assert.ok(preamble.includes('no person'));
  assert.ok(preamble.includes('no text'));
});

test('each angle instruction names its viewpoint concretely', () => {
  assert.ok(TURNAROUND_ANGLE_INSTRUCTIONS.three_quarter.includes('45 degrees'));
  assert.ok(TURNAROUND_ANGLE_INSTRUCTIONS.side.includes('90 degrees'));
  assert.ok(TURNAROUND_ANGLE_INSTRUCTIONS.back.toLowerCase().includes('behind'));
});

test('anglePrompt is total over the angle union', () => {
  // Type-level exhaustiveness: every TurnaroundAngle yields a non-empty prompt.
  const angles: readonly TurnaroundAngle[] = TURNAROUND_ANGLES;
  for (const angle of angles) {
    assert.ok(anglePrompt(angle).length > 0);
  }
});
