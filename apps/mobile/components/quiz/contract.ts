/**
 * Quiz contract adapters — the single seam between the mobile quiz UI and the
 * shared `@era/core/quiz` module (steps, archetypes, deterministic scoring).
 *
 * Everything the UI needs from that module is read HERE and re-shaped into the
 * small, stable types the components consume. Keeping the coupling in one file
 * means a change to the core contract touches one place, not every renderer.
 *
 * The step `kind` field is the module's discriminant, but the twelve step ids
 * are the pinned part of the contract, so renderer selection keys off `id` and
 * stays correct regardless of how `kind` is spelled.
 */
import {
  ARCHETYPES,
  QUIZ_STEPS,
  deterministicProfile,
  type QuizAnswers,
  type StyleProfileResult,
} from '@era/core/quiz';

/** One quiz step, as defined by the core module. */
export type QuizStep = (typeof QUIZ_STEPS)[number];

/** One selectable option within a step. `imageKey` is present on photo steps. */
export type QuizOption = QuizStep['options'][number];

/** Which renderer a step drives. Derived from the step's stable id. */
export type QuizRenderer = 'photo' | 'palette' | 'occasions' | 'budget' | 'mood';

/**
 * A single answer value: one option id, or (for `occasions`) a set of them.
 * Accumulated by the flow and handed to the core scorer at submit time.
 */
export type QuizAnswerValue = string | readonly string[];

/** The in-flight answer map, keyed by step id. Cast to {@link QuizAnswers} at the boundary. */
export type QuizAnswerMap = Record<string, QuizAnswerValue>;

/** The `occasions` step is the only multi-select. */
export function isMultiStep(step: QuizStep): boolean {
  return step.id === 'occasions';
}

/** Read an option's image key if it has one — photo/occasion options do. */
export function imageKeyOf(option: QuizOption): string | undefined {
  return 'imageKey' in option ? option.imageKey : undefined;
}

/** Pick the renderer for a step from its stable id. */
export function rendererFor(step: QuizStep): QuizRenderer {
  switch (step.id) {
    case 'palette':
      return 'palette';
    case 'occasions':
      return 'occasions';
    case 'budget':
      return 'budget';
    case 'era':
      return 'mood';
    default:
      return 'photo';
  }
}

/** Cast the accumulated answer map to the core module's validated shape. */
export function toQuizAnswers(answers: QuizAnswerMap): QuizAnswers {
  return answers as unknown as QuizAnswers;
}

/** Deterministic profile for the offline / API-failure fallback path. */
export function localProfile(answers: QuizAnswerMap): StyleProfileResult {
  return deterministicProfile(toQuizAnswers(answers));
}

/** The normalized reveal payload the reveal screen renders. */
export interface RevealData {
  readonly archetypeName: string;
  readonly keywords: readonly string[];
  readonly palette: readonly string[];
  readonly eraTitle: string;
  readonly eraDescription: string;
}

/**
 * Flatten a {@link StyleProfileResult} into the reveal's stable shape. The
 * archetype id is resolved to its human name via {@link ARCHETYPES}; anything
 * missing degrades to a sensible value so the reveal never renders blank.
 */
export function normalizeProfile(profile: StyleProfileResult): RevealData {
  const entry = ARCHETYPES[profile.archetype];
  return {
    archetypeName: entry?.name ?? profile.archetype,
    keywords: profile.keywords ?? [],
    palette: profile.palette ?? [],
    eraTitle: profile.era_suggestion.title,
    eraDescription: profile.era_suggestion.description,
  };
}

export type { QuizAnswers, StyleProfileResult };
export { QUIZ_STEPS };
