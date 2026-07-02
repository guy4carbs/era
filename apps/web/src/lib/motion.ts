/**
 * Motion helpers that translate `@era/tokens` spring definitions into
 * Framer Motion transitions, and centralise the reduced-motion fallback.
 *
 * Every animated component runs its transition through {@link transitionFor}
 * so that `prefers-reduced-motion` uniformly swaps springs for a short fade
 * (and callers separately disable pulse/parallax) — no per-component guesswork.
 */
import { motion as motionToken } from '@era/tokens';

/** Minimal shape of a token spring preset (mass optional). */
export interface SpringToken {
  stiffness: number;
  damping: number;
  mass?: number;
}

/** A named spring preset from the token motion scale. */
export type SpringName = keyof typeof motionToken.springs;

/** Build a Framer `spring` transition from a token preset. */
export function springTransition(spring: SpringToken) {
  return {
    type: 'spring' as const,
    stiffness: spring.stiffness,
    damping: spring.damping,
    ...(spring.mass !== undefined ? { mass: spring.mass } : {}),
  };
}

/**
 * The transition a component should use: a token spring normally, or a short
 * cross-fade (duration from `motion.durations.reducedFadeMs`) when the user has
 * requested reduced motion. `reduced` is the value from `useReducedMotion()`.
 */
export function transitionFor(spring: SpringToken, reduced: boolean | null) {
  if (reduced) {
    return { duration: motionToken.durations.reducedFadeMs / 1000 };
  }
  return springTransition(spring);
}
