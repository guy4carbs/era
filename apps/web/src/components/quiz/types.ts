import { QUIZ_STEPS } from '@era/core/quiz';

/** A single quiz step, derived from the shared `QUIZ_STEPS` definition. */
export type QuizStep = (typeof QUIZ_STEPS)[number];

/** One selectable option within a step. */
export type QuizOption = QuizStep['options'][number];

/**
 * The accent selection ring drawn around a chosen tile/board/card. Its width is
 * derived from the glass border token (×2) so no raw pixel value is written.
 */
export const SELECTION_RING =
  '0 0 0 calc(var(--glass-border-width) * 2) var(--color-accent)';
