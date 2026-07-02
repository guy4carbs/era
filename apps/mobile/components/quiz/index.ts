/** Era mobile — style-quiz components. */
export { QuizFlow } from './QuizFlow';
export { QuizIntro } from './QuizIntro';
export { QuizReveal } from './QuizReveal';
export { StepScreen } from './StepScreen';
export { ProgressDots } from './ProgressDots';
export { PhotoOptionGrid } from './PhotoOptionGrid';
export { PaletteBoards } from './PaletteBoards';
export { OccasionChips } from './OccasionChips';
export { TextBands } from './TextBands';
export { MoodCards } from './MoodCards';
export { deriveStyleProfile } from './deriveProfile';
export type { DeriveResult, ProfileSource } from './deriveProfile';
export {
  rendererFor,
  isMultiStep,
  normalizeProfile,
  localProfile,
  toQuizAnswers,
} from './contract';
export type {
  QuizStep,
  QuizOption,
  QuizRenderer,
  QuizAnswerValue,
  QuizAnswerMap,
  RevealData,
} from './contract';
