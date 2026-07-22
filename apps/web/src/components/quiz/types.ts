import { glow, motion as motionToken } from '@era/tokens';
import { QUIZ_STEPS } from '@era/core/quiz';
import { transitionFor } from '../../lib/motion';

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

// The selection glow bloom (§3 glow grammar): an accent halo at `--glow-blur`.
// On select, the shadow blooms from the steady base to a brighter PEAK
// (base × (1 + pulse.amount) — the same +10% the idle glow breathes to) and
// settles back into the steady ring. We bloom at the DARK base opacity so the
// halo reads on either surface. Expressed as opacity fractions → percentages so
// no raw colour is written (color-mix against the accent CSS var).
const BLOOM_BASE_PCT = Math.round(glow.opacity.dark * 100);
const BLOOM_PEAK_PCT = Math.round(glow.opacity.dark * (1 + glow.pulse.amount) * 100);

const glowRing = (pct: number) =>
  `0 0 var(--glow-blur) color-mix(in srgb, var(--color-accent) ${pct}%, transparent)`;

/** The settled shadow for a chosen tile: e3 lift + the steady accent ring. */
export const SELECTED_SHADOW = `var(--shadow-e3), ${SELECTION_RING}`;
/** The resting (unselected) elevation. */
export const REST_SHADOW = 'var(--shadow-e2)';

/**
 * The boxShadow choreography for a single-select tile/board/card. When a tile
 * becomes selected its shadow blooms to the accent PEAK, then settles into the
 * steady e3 + ring on the gentle spring (§3 glow bloom, item 3). Unselected
 * tiles hold the rest elevation. Under reduced motion the ring appears at once
 * (no bloom keyframe) via the fade `transitionFor` supplies.
 */
export function selectionShadow(
  selected: boolean,
  reduced: boolean | null,
  { lifted = true }: { lifted?: boolean } = {},
) {
  // The selection settles on the gentle spring, folded into the `animate` value
  // so it never fights the snappy press/hover transition on the same element.
  // `lifted` tiles (photo/board/card) settle to e3 + ring; flat chips settle to
  // the ring alone (they tint rather than rise), but both bloom the same halo.
  const transition = transitionFor(motionToken.springs.gentle, reduced);
  const base = lifted ? 'var(--shadow-e3), ' : '';
  if (!selected) {
    return { boxShadow: lifted ? REST_SHADOW : 'none', transition };
  }
  const settled = `${base}${glowRing(BLOOM_BASE_PCT)}, ${SELECTION_RING}`;
  const peak = `${base}${glowRing(BLOOM_PEAK_PCT)}, ${SELECTION_RING}`;
  // Reduced motion: land on the settled ring with no bloom keyframe.
  return { boxShadow: reduced ? settled : [peak, settled], transition };
}
