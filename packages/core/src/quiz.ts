/**
 * @era/core — the style quiz: data, scoring, and the deterministic profile.
 *
 * Twelve short steps map a user's taste onto one of eight style archetypes. The
 * scoring is a pure, explainable weighted sum — no model in the loop — so the
 * same answers always produce the same era. Ovi's LLM layer may enrich the
 * result later, but this module is the ground truth the product can trust.
 *
 * User-facing copy for the era reveal lives in Quill's copy deck; we import the
 * mood/era strings via the `./strings.ts` subpath and never inline copy here.
 *
 * Import via the `@era/core/quiz` subpath.
 */

import { z } from 'zod';

import { strings } from './strings.ts';

// -----------------------------------------------------------------------------
// Archetypes
// -----------------------------------------------------------------------------

/**
 * The eight style archetypes. The declaration order is load-bearing: it is the
 * canonical tie-break order for scoring (earlier wins a tie).
 */
export type Archetype =
  | 'quiet_luxe'
  | 'minimalist'
  | 'classic'
  | 'streetwear'
  | 'romantic'
  | 'edgy'
  | 'eclectic'
  | 'athleisure';

/**
 * The archetypes in fixed order. Iterating this (never `Object.keys`) is what
 * makes tie-breaks deterministic. `satisfies` keeps the literal tuple type while
 * proving every member is a valid {@link Archetype}.
 */
export const ARCHETYPE_ORDER = [
  'quiet_luxe',
  'minimalist',
  'classic',
  'streetwear',
  'romantic',
  'edgy',
  'eclectic',
  'athleisure',
] as const satisfies readonly Archetype[];

/** Palette and keyword identity for one archetype. Hexes are garment-world colors. */
export interface ArchetypeDef {
  /** Display name, also passed to Ovi's `eraFor` copy. */
  readonly name: string;
  /** Descriptive keywords surfaced on the profile. */
  readonly keywords: readonly string[];
  /** Core neutrals — always present in the palette. */
  readonly anchorHexes: readonly string[];
  /** Color "pops" added when the user wants more color. */
  readonly accentHexes: readonly string[];
}

/**
 * Palette + keyword identity per archetype. Anchor hexes are the archetype's
 * neutral backbone; accent hexes are the pops layered in by the palette step.
 */
export const ARCHETYPES = {
  quiet_luxe: {
    name: 'Quiet Luxe',
    keywords: ['understated', 'refined', 'tactile', 'timeless', 'quality-first'],
    anchorHexes: ['#F1E9DC', '#B0906B', '#3A3833', '#1C1B19'],
    accentHexes: ['#8A7B6B', '#A3A68F'],
  },
  minimalist: {
    name: 'Minimalist',
    keywords: ['clean', 'essential', 'monochrome', 'precise', 'uncluttered'],
    anchorHexes: ['#FFFFFF', '#C9C7C4', '#1A1A1A', '#E8E4DD'],
    accentHexes: ['#4A6D7C', '#9AA0A6'],
  },
  classic: {
    name: 'Classic',
    keywords: ['tailored', 'polished', 'heritage', 'balanced', 'enduring'],
    anchorHexes: ['#1F2A44', '#FFFFFF', '#C8A97E', '#6E1F2A'],
    accentHexes: ['#244F3B', '#B08D3A'],
  },
  streetwear: {
    name: 'Streetwear',
    keywords: ['bold', 'graphic', 'relaxed', 'sneaker-led', 'expressive'],
    anchorHexes: ['#121212', '#6B6B6B', '#E8E8E8'],
    accentHexes: ['#FF4D2E', '#FFD400'],
  },
  romantic: {
    name: 'Romantic',
    keywords: ['soft', 'feminine', 'flowing', 'delicate', 'pretty'],
    anchorHexes: ['#F3D9DA', '#FBF6EE', '#A7B49E', '#9DB4C8'],
    accentHexes: ['#C98B9A', '#B7A7C9'],
  },
  edgy: {
    name: 'Edgy',
    keywords: ['dark', 'sharp', 'rebellious', 'structured', 'moody'],
    anchorHexes: ['#0E0E0E', '#3C3F44', '#4A1C24'],
    accentHexes: ['#6C727B', '#7A1220'],
  },
  eclectic: {
    name: 'Eclectic',
    keywords: ['playful', 'mixed', 'color-forward', 'individual', 'unexpected'],
    anchorHexes: ['#2A6F6B', '#E4572E', '#F2C14E', '#4C3B8C'],
    accentHexes: ['#E75A7C', '#17BEBB'],
  },
  athleisure: {
    name: 'Athleisure',
    keywords: ['sporty', 'comfortable', 'functional', 'sleek', 'active'],
    anchorHexes: ['#101112', '#FFFFFF', '#D8D4CE'],
    accentHexes: ['#00E0A4', '#2F80ED'],
  },
} as const satisfies Record<Archetype, ArchetypeDef>;

// -----------------------------------------------------------------------------
// Steps
// -----------------------------------------------------------------------------

/** One selectable answer within a step. */
export interface QuizOption {
  /** Stable id — the value stored in the user's answers. */
  readonly id: string;
  /**
   * Short static label. Empty for the era step, whose cards render from
   * `strings.quiz.moods[id].title` at display time (see the era step below).
   */
  readonly label: string;
  /** Photo asset key, when the option is shown as an image tile. */
  readonly imageKey?: string;
  /** Archetype weights this option contributes to the score. */
  readonly weights: Partial<Record<Archetype, number>>;
}

/** One screen of the quiz. */
export interface QuizStep {
  /** Stable id — the key under which the answer is stored. */
  readonly id: string;
  /** Short UI title. */
  readonly title: string;
  /** One-line question in Ovi's voice. */
  readonly prompt: string;
  /** Single-choice or multi-select. */
  readonly kind: 'single' | 'multi';
  /** The options, in display order. */
  readonly options: readonly QuizOption[];
}

/**
 * The twelve quiz steps, in order. `as const` pins every literal (ids, labels,
 * weights) so consumers get exact autocomplete and can't typo a key;
 * `satisfies` proves the shape without widening it.
 *
 * Weight design notes:
 * - Magnitudes are 1–3. The icon board (step 9) is the heaviest single signal
 *   (primary 3, secondary 1) because it is the most direct taste read.
 * - `classic` and `athleisure` have no primary board of their own; they are made
 *   winnable through silhouette / shoes / outerwear / occasions / budget plus
 *   secondary board weights.
 * - The era step carries zero weights: it steers the era *mood*, not the
 *   archetype.
 */
export const QUIZ_STEPS = [
  {
    id: 'vibe',
    title: 'Vibe check',
    prompt: 'Where do you land, day to day?',
    kind: 'single',
    options: [
      // Spec anchor — do not change these weights without updating the contract.
      { id: 's1_minimal', label: 'Pared back', imageKey: 's1_minimal', weights: { minimalist: 2, quiet_luxe: 2, classic: 1 } },
      { id: 's1_expressive', label: 'Turned up', imageKey: 's1_expressive', weights: { streetwear: 2, eclectic: 2, edgy: 1 } },
    ],
  },
  {
    id: 'palette',
    title: 'Palette pull',
    prompt: 'How much color makes it into your closet?',
    kind: 'single',
    options: [
      { id: 'all_neutrals', label: 'All neutrals', weights: { minimalist: 2, quiet_luxe: 1, classic: 1 } },
      { id: 'neutral_pops', label: 'Neutrals, one pop', weights: { classic: 1, edgy: 1, athleisure: 1 } },
      { id: 'full_color', label: 'Bring the color', weights: { eclectic: 2, romantic: 1, streetwear: 1 } },
    ],
  },
  {
    id: 'silhouette',
    title: 'Silhouette',
    prompt: 'How do you like a piece to sit?',
    kind: 'single',
    options: [
      { id: 's3_fitted', label: 'Fitted', imageKey: 's3_fitted', weights: { classic: 1, quiet_luxe: 1, edgy: 1 } },
      { id: 's3_relaxed', label: 'Relaxed', imageKey: 's3_relaxed', weights: { streetwear: 1, athleisure: 1, minimalist: 1 } },
    ],
  },
  {
    id: 'texture',
    title: 'Texture',
    prompt: 'Crisp or cozy to the touch?',
    kind: 'single',
    options: [
      { id: 's4_structured', label: 'Structured', imageKey: 's4_structured', weights: { edgy: 2, classic: 1, minimalist: 1 } },
      { id: 's4_soft', label: 'Soft', imageKey: 's4_soft', weights: { romantic: 2, quiet_luxe: 1, athleisure: 1 } },
    ],
  },
  {
    id: 'print',
    title: 'Print tolerance',
    prompt: 'How loud do your prints get?',
    kind: 'single',
    options: [
      { id: 's5_solids', label: 'Solids only', imageKey: 's5_solids', weights: { minimalist: 2, quiet_luxe: 1, classic: 1 } },
      { id: 's5_subtle', label: 'Subtle', imageKey: 's5_subtle', weights: { classic: 2, quiet_luxe: 1, romantic: 1 } },
      { id: 's5_bold', label: 'Bold', imageKey: 's5_bold', weights: { eclectic: 2, streetwear: 2, edgy: 1 } },
    ],
  },
  {
    id: 'shoes',
    title: 'Shoe energy',
    prompt: "What's usually on your feet?",
    kind: 'single',
    options: [
      { id: 's6_sneakers', label: 'Sneakers', imageKey: 's6_sneakers', weights: { athleisure: 2, streetwear: 1 } },
      { id: 's6_boots', label: 'Boots', imageKey: 's6_boots', weights: { edgy: 2, streetwear: 1, eclectic: 1 } },
      { id: 's6_loafers', label: 'Loafers', imageKey: 's6_loafers', weights: { classic: 2, quiet_luxe: 1 } },
    ],
  },
  {
    id: 'accessories',
    title: 'Accessory load',
    prompt: 'How much hardware do you wear?',
    kind: 'single',
    options: [
      { id: 's7_bare', label: 'Bare', imageKey: 's7_bare', weights: { minimalist: 2, quiet_luxe: 1 } },
      { id: 's7_signature', label: 'One signature', imageKey: 's7_signature', weights: { classic: 1, quiet_luxe: 1, romantic: 1 } },
      { id: 's7_stacked', label: 'Stacked', imageKey: 's7_stacked', weights: { eclectic: 2, streetwear: 1, romantic: 1 } },
    ],
  },
  {
    id: 'occasions',
    title: 'Occasion mix',
    prompt: 'Where does your week actually go?',
    kind: 'multi',
    options: [
      { id: 's8_work', label: 'Work', imageKey: 's8_work', weights: { classic: 1, quiet_luxe: 1, minimalist: 1 } },
      { id: 's8_casual', label: 'Casual', imageKey: 's8_casual', weights: { streetwear: 1, athleisure: 1, minimalist: 1 } },
      { id: 's8_nights', label: 'Nights out', imageKey: 's8_nights', weights: { edgy: 1, streetwear: 1, eclectic: 1 } },
      { id: 's8_active', label: 'Active', imageKey: 's8_active', weights: { athleisure: 2 } },
      { id: 's8_events', label: 'Events', imageKey: 's8_events', weights: { romantic: 2, classic: 1, quiet_luxe: 1 } },
    ],
  },
  {
    id: 'iconboard',
    title: 'Icon board',
    prompt: 'Which board pulls you straight in?',
    kind: 'single',
    options: [
      { id: 's9_quiet_luxe', label: 'Quiet luxe', imageKey: 's9_quiet_luxe', weights: { quiet_luxe: 3, classic: 1 } },
      { id: 's9_minimalist', label: 'Minimalist', imageKey: 's9_minimalist', weights: { minimalist: 3, quiet_luxe: 1 } },
      { id: 's9_streetwear', label: 'Streetwear', imageKey: 's9_streetwear', weights: { streetwear: 3, athleisure: 1 } },
      { id: 's9_romantic', label: 'Romantic', imageKey: 's9_romantic', weights: { romantic: 3, eclectic: 1 } },
      { id: 's9_edgy', label: 'Edgy', imageKey: 's9_edgy', weights: { edgy: 3, streetwear: 1 } },
      { id: 's9_eclectic', label: 'Eclectic', imageKey: 's9_eclectic', weights: { eclectic: 3, romantic: 1 } },
    ],
  },
  {
    id: 'outerwear',
    title: 'Outerwear soul',
    prompt: 'Your desert-island jacket?',
    kind: 'single',
    options: [
      { id: 's10_blazer', label: 'Blazer', imageKey: 's10_blazer', weights: { classic: 2, quiet_luxe: 1 } },
      { id: 's10_bomber', label: 'Bomber', imageKey: 's10_bomber', weights: { streetwear: 2, edgy: 1 } },
      { id: 's10_longcoat', label: 'Long coat', imageKey: 's10_longcoat', weights: { minimalist: 1, quiet_luxe: 1, edgy: 1, romantic: 1 } },
      { id: 's10_technical', label: 'Technical shell', imageKey: 's10_technical', weights: { athleisure: 2, streetwear: 1 } },
    ],
  },
  {
    id: 'budget',
    title: 'Budget comfort',
    prompt: 'How do you like to spend on clothes?',
    kind: 'single',
    options: [
      { id: 'value_first', label: 'Value-first', weights: { streetwear: 1, athleisure: 1 } },
      { id: 'mid', label: 'Mid-range', weights: { classic: 1, minimalist: 1 } },
      { id: 'premium', label: 'Premium', weights: { quiet_luxe: 2, classic: 1 } },
      { id: 'mix_high_low', label: 'Mix high & low', weights: { eclectic: 1, streetwear: 1 } },
    ],
  },
  {
    id: 'era',
    // The era step steers the *mood* of the reveal, not the archetype — hence
    // zero weights. Cards render from `strings.quiz.moods[id]`, so labels are
    // intentionally empty (the UI must not hardcode mood copy here).
    title: 'Era aspiration',
    prompt: 'Where are you headed next?',
    kind: 'single',
    options: [
      { id: 'reset', label: '', weights: {} },
      { id: 'refined', label: '', weights: {} },
      { id: 'bold', label: '', weights: {} },
      { id: 'soft', label: '', weights: {} },
      { id: 'experimental', label: '', weights: {} },
      { id: 'effortless', label: '', weights: {} },
    ],
  },
] as const satisfies readonly QuizStep[];

// -----------------------------------------------------------------------------
// Scoring
// -----------------------------------------------------------------------------

/** A fresh totals map with every archetype at zero, in fixed order. */
function zeroTotals(): Record<Archetype, number> {
  const totals = {} as Record<Archetype, number>;
  for (const archetype of ARCHETYPE_ORDER) {
    totals[archetype] = 0;
  }
  return totals;
}

/**
 * Score a set of answers into a winner, a runner-up, and the full totals.
 *
 * Pure and total: unknown step or option ids are ignored, multi-selects
 * accumulate, and ties resolve by {@link ARCHETYPE_ORDER} (earlier wins).
 */
export function scoreQuiz(answers: QuizAnswers): {
  archetype: Archetype;
  secondary: Archetype;
  totals: Record<Archetype, number>;
} {
  const totals = zeroTotals();

  for (const step of QUIZ_STEPS) {
    const answer = answers.steps[step.id];
    if (answer === undefined) continue;
    const selected = Array.isArray(answer) ? answer : [answer];
    for (const optionId of selected) {
      const option = step.options.find((candidate) => candidate.id === optionId);
      if (!option) continue;
      for (const [archetype, weight] of Object.entries(option.weights)) {
        totals[archetype as Archetype] += weight ?? 0;
      }
    }
  }

  // Rank by score desc, breaking ties by fixed order (earlier index wins).
  const ranked = [...ARCHETYPE_ORDER].sort((a, b) => {
    const byScore = totals[b] - totals[a];
    if (byScore !== 0) return byScore;
    return ARCHETYPE_ORDER.indexOf(a) - ARCHETYPE_ORDER.indexOf(b);
  });

  // `ranked` is a permutation of all eight archetypes, so [0] and [1] always
  // exist; the tuple fallbacks satisfy noUncheckedIndexedAccess.
  return {
    archetype: ranked[0] ?? ARCHETYPE_ORDER[0],
    secondary: ranked[1] ?? ARCHETYPE_ORDER[1],
    totals,
  };
}

// -----------------------------------------------------------------------------
// Deterministic profile
// -----------------------------------------------------------------------------

/** The style profile produced deterministically from a completed quiz. */
export interface StyleProfileResult {
  readonly archetype: Archetype;
  readonly secondary: Archetype;
  readonly palette: readonly string[];
  readonly keywords: readonly string[];
  readonly era_suggestion: { readonly title: string; readonly description: string };
}

/**
 * Build the palette for the winning archetype, refined by the palette step:
 * - `all_neutrals` → anchors only
 * - `neutral_pops` → anchors + the first accent
 * - `full_color`   → anchors + every accent
 * Any other/absent value defaults to anchors only.
 */
function paletteFor(archetype: Archetype, paletteChoice: string | undefined): string[] {
  const { anchorHexes, accentHexes } = ARCHETYPES[archetype];
  if (paletteChoice === 'full_color') return [...anchorHexes, ...accentHexes];
  if (paletteChoice === 'neutral_pops') {
    return accentHexes.length > 0 ? [...anchorHexes, accentHexes[0]] : [...anchorHexes];
  }
  return [...anchorHexes];
}

/**
 * Turn answers into a full style profile without any model call. Palette and
 * keywords come from the winning archetype; the era suggestion fuses the chosen
 * mood with the archetype via Quill's copy (`strings.quiz.eraFor`, which falls
 * back to the 'reset' mood on an unknown id).
 */
export function deterministicProfile(answers: QuizAnswers): StyleProfileResult {
  const { archetype, secondary } = scoreQuiz(answers);
  const def = ARCHETYPES[archetype];

  const paletteChoice = answers.steps.palette;
  const palette = paletteFor(archetype, typeof paletteChoice === 'string' ? paletteChoice : undefined);

  const moodAnswer = answers.steps.era;
  const moodId = typeof moodAnswer === 'string' ? moodAnswer : 'reset';

  return {
    archetype,
    secondary,
    palette,
    keywords: [...def.keywords],
    era_suggestion: strings.quiz.eraFor(moodId, def.name),
  };
}

// -----------------------------------------------------------------------------
// Validation schemas
// -----------------------------------------------------------------------------

/** Matches one of the eight archetypes. */
const ArchetypeSchema = z.enum(ARCHETYPE_ORDER);

/**
 * A submitted set of quiz answers. Every step must be answered (skip = no
 * submission), single steps take a string, multi steps take an array of strings.
 *
 * Values are constrained to each step's own option ids, derived from
 * {@link QUIZ_STEPS} rather than hand-enumerated. This closes two things at once:
 * unknown step keys and free-form option strings are both rejected, so nothing a
 * client invents ever reaches the scorer or the LLM prompt (prompt-injection
 * surface). Multi steps additionally require at least one, unique, in-range
 * selections.
 */
export const QuizAnswersSchema = z
  .object({
    v: z.literal(1),
    steps: z.record(z.string(), z.union([z.string(), z.array(z.string())])),
  })
  .strict()
  .superRefine((value, ctx) => {
    const knownStepIds = new Set<string>(QUIZ_STEPS.map((step) => step.id));

    // Reject any step key that isn't part of the quiz — the answer set may only
    // carry the twelve known steps, nothing extra.
    for (const key of Object.keys(value.steps)) {
      if (!knownStepIds.has(key)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Unknown step "${key}".`,
          path: ['steps', key],
        });
      }
    }

    for (const step of QUIZ_STEPS) {
      const answer = value.steps[step.id];
      if (answer === undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Missing answer for step "${step.id}".`,
          path: ['steps', step.id],
        });
        continue;
      }

      const optionIds = new Set<string>(step.options.map((option) => option.id));

      if (step.kind === 'multi') {
        if (!Array.isArray(answer)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `Step "${step.id}" expects one or more selections.`,
            path: ['steps', step.id],
          });
          continue;
        }
        if (answer.length === 0) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `Step "${step.id}" expects at least one selection.`,
            path: ['steps', step.id],
          });
        }
        if (answer.length > step.options.length) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `Step "${step.id}" has more selections than it has options.`,
            path: ['steps', step.id],
          });
        }
        if (new Set(answer).size !== answer.length) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `Step "${step.id}" has duplicate selections.`,
            path: ['steps', step.id],
          });
        }
        for (const optionId of answer) {
          if (!optionIds.has(optionId)) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: `Step "${step.id}" has unknown option "${optionId}".`,
              path: ['steps', step.id],
            });
          }
        }
        continue;
      }

      // single
      if (Array.isArray(answer)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Step "${step.id}" expects a single selection.`,
          path: ['steps', step.id],
        });
        continue;
      }
      if (!optionIds.has(answer)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Step "${step.id}" has unknown option "${answer}".`,
          path: ['steps', step.id],
        });
      }
    }
  });

/**
 * The deterministic profile shape. Kept structured-output friendly: object and
 * array shapes only, no numeric bounds, so it can back an LLM structured
 * response as-is.
 */
export const StyleProfileResultSchema = z.object({
  archetype: ArchetypeSchema,
  secondary: ArchetypeSchema,
  palette: z.array(z.string()).min(1),
  keywords: z.array(z.string()).min(1),
  era_suggestion: z.object({
    title: z.string(),
    description: z.string(),
  }),
});

/** A validated set of quiz answers. */
export type QuizAnswers = z.infer<typeof QuizAnswersSchema>;
