import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  ARCHETYPES,
  ARCHETYPE_ORDER,
  QUIZ_STEPS,
  QuizAnswersSchema,
  StyleProfileResultSchema,
  deterministicProfile,
  scoreQuiz,
  type Archetype,
  type QuizAnswers,
  type QuizStep,
} from './quiz.ts';
import { strings } from './strings.ts';

// The pinned cross-agent image-key contract. Other agents build tiles against
// exactly these 30 keys — this list is hardcoded on purpose so a drift in
// quiz.ts fails here loudly.
const EXPECTED_IMAGE_KEYS = [
  's1_minimal', 's1_expressive',
  's3_fitted', 's3_relaxed',
  's4_structured', 's4_soft',
  's5_solids', 's5_subtle', 's5_bold',
  's6_sneakers', 's6_boots', 's6_loafers',
  's7_bare', 's7_signature', 's7_stacked',
  's8_work', 's8_casual', 's8_nights', 's8_active', 's8_events',
  's9_quiet_luxe', 's9_minimalist', 's9_streetwear', 's9_romantic', 's9_edgy', 's9_eclectic',
  's10_blazer', 's10_bomber', 's10_longcoat', 's10_technical',
];

/** Build a QuizAnswers with the literal-1 version tag. */
function answersFor(steps: Record<string, string | string[]>): QuizAnswers {
  return { v: 1, steps };
}

// Widened view of the steps: `as const` narrows options so `imageKey` is absent
// on the option types that omit it; the QuizStep contract makes it optional.
const STEPS: readonly QuizStep[] = QUIZ_STEPS;

// --- structure ---------------------------------------------------------------

test('there are exactly twelve steps in the documented order', () => {
  assert.equal(QUIZ_STEPS.length, 12);
  assert.deepEqual(
    QUIZ_STEPS.map((step) => step.id),
    ['vibe', 'palette', 'silhouette', 'texture', 'print', 'shoes', 'accessories', 'occasions', 'iconboard', 'outerwear', 'budget', 'era'],
  );
});

test('occasions is the only multi-select step', () => {
  const multi = QUIZ_STEPS.filter((step) => step.kind === 'multi').map((step) => step.id);
  assert.deepEqual(multi, ['occasions']);
});

test('there are eight archetypes in the fixed tie-break order', () => {
  assert.deepEqual(ARCHETYPE_ORDER, [
    'quiet_luxe', 'minimalist', 'classic', 'streetwear', 'romantic', 'edgy', 'eclectic', 'athleisure',
  ]);
});

// --- spec anchor (verbatim) --------------------------------------------------

test('vibe → pared back carries the exact spec weights', () => {
  const vibe = QUIZ_STEPS.find((step) => step.id === 'vibe');
  const paredBack = vibe?.options.find((option) => option.id === 's1_minimal');
  assert.ok(paredBack);
  assert.deepEqual(paredBack.weights, { minimalist: 2, quiet_luxe: 2, classic: 1 });
});

// --- weight-matrix invariants ------------------------------------------------

test('every non-era option touches at least one archetype, magnitudes 1–3', () => {
  for (const step of QUIZ_STEPS) {
    for (const option of step.options) {
      const entries = Object.entries(option.weights);
      if (step.id === 'era') {
        assert.equal(entries.length, 0, `era option ${option.id} must carry no weight`);
        continue;
      }
      assert.ok(entries.length >= 1, `option ${option.id} touches no archetype`);
      for (const [archetype, weight] of entries) {
        assert.ok(
          typeof weight === 'number' && weight >= 1 && weight <= 3,
          `option ${option.id} weight for ${archetype} is out of range: ${weight}`,
        );
      }
    }
  }
});

test('the era step contributes zero weight to every archetype', () => {
  const era = QUIZ_STEPS.find((step) => step.id === 'era');
  assert.ok(era);
  for (const option of era.options) {
    assert.deepEqual(option.weights, {});
  }
});

// --- image-key contract ------------------------------------------------------

test('image keys match the pinned 30-key list exactly', () => {
  const keys: string[] = [];
  for (const step of STEPS) {
    for (const option of step.options) {
      if (option.imageKey !== undefined) keys.push(option.imageKey);
    }
  }
  assert.deepEqual([...keys].sort(), [...EXPECTED_IMAGE_KEYS].sort());
  assert.equal(keys.length, EXPECTED_IMAGE_KEYS.length);
  assert.equal(new Set(keys).size, keys.length, 'image keys must be unique');
});

test('palette, budget, and era options carry no image key', () => {
  for (const stepId of ['palette', 'budget', 'era']) {
    const step = STEPS.find((candidate) => candidate.id === stepId);
    assert.ok(step);
    for (const option of step.options) {
      assert.equal(option.imageKey, undefined, `${stepId}/${option.id} must not have an image key`);
    }
  }
});

// --- winnability: every archetype can win --------------------------------------

/** A maximal answer set per archetype, proving each of the eight is reachable. */
const WINNING_ANSWERS: Record<Archetype, Record<string, string | string[]>> = {
  quiet_luxe: {
    vibe: 's1_minimal', palette: 'all_neutrals', silhouette: 's3_fitted', texture: 's4_soft',
    print: 's5_solids', shoes: 's6_loafers', accessories: 's7_bare', occasions: ['s8_work'],
    iconboard: 's9_quiet_luxe', outerwear: 's10_blazer', budget: 'premium', era: 'refined',
  },
  minimalist: {
    vibe: 's1_minimal', palette: 'all_neutrals', silhouette: 's3_relaxed', texture: 's4_structured',
    print: 's5_solids', shoes: 's6_sneakers', accessories: 's7_bare', occasions: ['s8_casual'],
    iconboard: 's9_minimalist', outerwear: 's10_longcoat', budget: 'mid', era: 'reset',
  },
  classic: {
    vibe: 's1_minimal', palette: 'neutral_pops', silhouette: 's3_fitted', texture: 's4_structured',
    print: 's5_subtle', shoes: 's6_loafers', accessories: 's7_signature', occasions: ['s8_work'],
    iconboard: 's9_quiet_luxe', outerwear: 's10_blazer', budget: 'mid', era: 'refined',
  },
  streetwear: {
    vibe: 's1_expressive', palette: 'full_color', silhouette: 's3_relaxed', texture: 's4_soft',
    print: 's5_bold', shoes: 's6_sneakers', accessories: 's7_stacked', occasions: ['s8_casual'],
    iconboard: 's9_streetwear', outerwear: 's10_bomber', budget: 'value_first', era: 'bold',
  },
  romantic: {
    vibe: 's1_minimal', palette: 'full_color', silhouette: 's3_fitted', texture: 's4_soft',
    print: 's5_subtle', shoes: 's6_sneakers', accessories: 's7_signature', occasions: ['s8_events'],
    iconboard: 's9_romantic', outerwear: 's10_longcoat', budget: 'value_first', era: 'soft',
  },
  edgy: {
    vibe: 's1_expressive', palette: 'neutral_pops', silhouette: 's3_fitted', texture: 's4_structured',
    print: 's5_bold', shoes: 's6_boots', accessories: 's7_bare', occasions: ['s8_nights'],
    iconboard: 's9_edgy', outerwear: 's10_longcoat', budget: 'mid', era: 'bold',
  },
  eclectic: {
    vibe: 's1_expressive', palette: 'full_color', silhouette: 's3_relaxed', texture: 's4_soft',
    print: 's5_bold', shoes: 's6_boots', accessories: 's7_stacked', occasions: ['s8_nights'],
    iconboard: 's9_eclectic', outerwear: 's10_blazer', budget: 'mix_high_low', era: 'experimental',
  },
  athleisure: {
    vibe: 's1_minimal', palette: 'neutral_pops', silhouette: 's3_relaxed', texture: 's4_soft',
    print: 's5_solids', shoes: 's6_sneakers', accessories: 's7_bare', occasions: ['s8_active', 's8_casual'],
    iconboard: 's9_streetwear', outerwear: 's10_technical', budget: 'value_first', era: 'effortless',
  },
};

for (const archetype of ARCHETYPE_ORDER) {
  test(`${archetype} is winnable with a targeted answer set`, () => {
    const result = scoreQuiz(answersFor(WINNING_ANSWERS[archetype]));
    assert.equal(
      result.archetype,
      archetype,
      `expected ${archetype} to win, got ${result.archetype} (totals: ${JSON.stringify(result.totals)})`,
    );
    assert.notEqual(result.secondary, result.archetype, 'secondary must differ from the winner');
  });
}

// --- tie-break determinism ----------------------------------------------------

test('a tie resolves to the earlier archetype in fixed order', () => {
  // vibe → pared back gives quiet_luxe 2, minimalist 2, classic 1: quiet_luxe
  // precedes minimalist in ARCHETYPE_ORDER, so it wins the tie.
  const result = scoreQuiz(answersFor({ vibe: 's1_minimal' }));
  assert.equal(result.totals.quiet_luxe, 2);
  assert.equal(result.totals.minimalist, 2);
  assert.equal(result.archetype, 'quiet_luxe');
  assert.equal(result.secondary, 'minimalist');
});

// --- multi-select accumulation ------------------------------------------------

test('multi-select occasions accumulate their weights', () => {
  const result = scoreQuiz(answersFor({ occasions: ['s8_active', 's8_casual'] }));
  // active → athleisure 2; casual → athleisure 1, streetwear 1, minimalist 1.
  assert.equal(result.totals.athleisure, 3);
  assert.equal(result.totals.streetwear, 1);
  assert.equal(result.totals.minimalist, 1);
});

test('unknown step and option ids are ignored', () => {
  const result = scoreQuiz(answersFor({ nope: 'whatever', vibe: 'not_an_option' }));
  for (const archetype of ARCHETYPE_ORDER) {
    assert.equal(result.totals[archetype], 0);
  }
});

// --- deterministic profile ----------------------------------------------------

test('deterministicProfile returns a complete, populated profile', () => {
  const profile = deterministicProfile(answersFor(WINNING_ANSWERS.quiet_luxe));
  assert.equal(profile.archetype, 'quiet_luxe');
  assert.notEqual(profile.secondary, 'quiet_luxe');
  assert.ok(profile.palette.length >= 1);
  assert.ok(profile.keywords.length >= 1);
  assert.deepEqual(profile.keywords, [...ARCHETYPES.quiet_luxe.keywords]);
  assert.equal(typeof profile.era_suggestion.title, 'string');
  assert.equal(typeof profile.era_suggestion.description, 'string');
  assert.ok(profile.era_suggestion.title.length > 0);
  assert.ok(profile.era_suggestion.description.length > 0);
  // The profile must satisfy its own schema.
  StyleProfileResultSchema.parse(profile);
});

test('palette derivation branches on the palette answer', () => {
  const base = WINNING_ANSWERS.athleisure;
  const neutrals = deterministicProfile(answersFor({ ...base, palette: 'all_neutrals' }));
  const pops = deterministicProfile(answersFor({ ...base, palette: 'neutral_pops' }));
  const full = deterministicProfile(answersFor({ ...base, palette: 'full_color' }));

  // The palette swing (max ±2) never unseats the athleisure winner here.
  assert.equal(neutrals.archetype, 'athleisure');
  assert.equal(pops.archetype, 'athleisure');
  assert.equal(full.archetype, 'athleisure');

  const anchors = ARCHETYPES.athleisure.anchorHexes.length;
  const accents = ARCHETYPES.athleisure.accentHexes.length;
  assert.equal(neutrals.palette.length, anchors);
  assert.equal(pops.palette.length, anchors + 1);
  assert.equal(full.palette.length, anchors + accents);
});

test('era_suggestion fuses the chosen mood with the archetype via Quill copy', () => {
  const profile = deterministicProfile(answersFor(WINNING_ANSWERS.streetwear));
  // streetwear answer set picks the 'bold' mood.
  const expected = strings.quiz.eraFor('bold', ARCHETYPES.streetwear.name);
  assert.deepEqual(profile.era_suggestion, expected);
});

// --- validation schemas -------------------------------------------------------

test('QuizAnswersSchema accepts a complete answer set', () => {
  const parsed = QuizAnswersSchema.parse(answersFor(WINNING_ANSWERS.classic));
  assert.equal(parsed.v, 1);
});

test('QuizAnswersSchema rejects a submission missing a step', () => {
  const incomplete = { ...WINNING_ANSWERS.classic };
  delete incomplete.era;
  assert.throws(() => QuizAnswersSchema.parse(answersFor(incomplete)), /era/);
});

test('QuizAnswersSchema enforces single vs multi shape', () => {
  // occasions is multi — a bare string must be rejected.
  const badMulti = { ...WINNING_ANSWERS.classic, occasions: 's8_work' };
  assert.throws(() => QuizAnswersSchema.parse(answersFor(badMulti)), /occasions/);
  // vibe is single — an array must be rejected.
  const badSingle = { ...WINNING_ANSWERS.classic, vibe: ['s1_minimal'] };
  assert.throws(() => QuizAnswersSchema.parse(answersFor(badSingle)), /vibe/);
});

test('StyleProfileResultSchema rejects empty palette or keywords', () => {
  const valid = deterministicProfile(answersFor(WINNING_ANSWERS.edgy));
  assert.throws(() => StyleProfileResultSchema.parse({ ...valid, palette: [] }));
  assert.throws(() => StyleProfileResultSchema.parse({ ...valid, keywords: [] }));
});
