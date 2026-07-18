/**
 * Motion helpers that translate `@era/tokens` spring definitions into
 * Framer Motion transitions, and centralise the reduced-motion fallback.
 *
 * Every animated component runs its transition through {@link transitionFor}
 * so that `prefers-reduced-motion` uniformly swaps springs for a short fade
 * (and callers separately disable pulse/parallax) — no per-component guesswork.
 */
import type { Variants } from 'motion/react';
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

/**
 * The universal tap affordance (§3: "scale 0.97 on press-in, spring back; every
 * tappable element — nothing is inert"). Spreads onto any `motion.*` element to
 * give it the press-scale on the snappy spring. Under reduced motion the tap
 * scale collapses to nothing (the transition still degrades to the 150ms fade).
 *
 * Pass `interactive: false` (e.g. a disabled control) to drop `whileTap`
 * entirely so a non-actionable element never presses.
 */
export function pressProps(reduced: boolean | null, interactive = true) {
  return {
    whileTap:
      interactive && !reduced ? { scale: motionToken.press.scale } : undefined,
    transition: transitionFor(motionToken.springs.snappy, reduced),
  };
}

/** A pair of Framer variant objects for a staggered list/grid entrance. */
export interface StaggerVariants {
  container: Variants;
  item: Variants;
}

/**
 * List/grid/chat entrance choreography (§3: "children delay 45ms; y 12→0;
 * opacity 0→1; blur 4→0"). Returns `{ container, item }` variant objects — put
 * `container` on the list wrapper (as `initial="hidden" animate="visible"`) and
 * `item` on each entry (`variants={item}`); children inherit the stagger.
 *
 * All values come from the tokens (`stagger.delayMs/riseYPx/blurPx`). Under
 * reduced motion the stagger delay is 0, the item hides on opacity alone (no
 * rise, no blur), and the reveal is the flat 150ms fade.
 */
export function useStagger(reduced: boolean | null): StaggerVariants {
  const { delayMs, riseYPx, blurPx } = motionToken.stagger;
  return {
    container: {
      hidden: {},
      visible: {
        transition: { staggerChildren: reduced ? 0 : delayMs / 1000 },
      },
    },
    item: reduced
      ? {
          hidden: { opacity: 0 },
          visible: {
            opacity: 1,
            transition: transitionFor(motionToken.springs.gentle, reduced),
          },
        }
      : {
          hidden: { opacity: 0, y: riseYPx, filter: `blur(${blurPx}px)` },
          visible: {
            opacity: 1,
            y: 0,
            filter: 'blur(0px)',
            transition: transitionFor(motionToken.springs.gentle, reduced),
          },
        },
  };
}

/**
 * Route the given navigation through the browser's View Transitions API for a
 * cross-fade + rise between pages (the CSS in `globals.css` styles `::view-
 * transition-*`). Falls back to a plain synchronous `navigate()` when the API
 * is unavailable OR the user prefers reduced motion — in both cases the page
 * simply swaps with no animation.
 *
 * Reduced motion is read here via `matchMedia` so callers need not thread it
 * through; on the server (no `document`) we just navigate.
 */
export function viewTransition(navigate: () => void): void {
  if (typeof document === 'undefined') {
    navigate();
    return;
  }
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const startViewTransition = document.startViewTransition?.bind(document);
  if (startViewTransition && !reduced) {
    startViewTransition(navigate);
  } else {
    navigate();
  }
}
