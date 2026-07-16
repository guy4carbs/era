/**
 * @era/core — the AI turnaround-views wire contract + QA gate. PURE, ZERO deps.
 *
 * Turnaround views are flag-gated multi-angle renders of an item's cutout: given
 * one product-photo cutout, an image API renders the SAME piece from a
 * three-quarter, side, and back viewpoint, and Claude vision QAs each render
 * before it is ever shown. This module is the single shared surface across the
 * tiers: both clients (the closet detail view) CONSUME the GET payload, the server
 * ASSEMBLES it and drives generation from the prompts here, and the QA verdict is
 * scored by the pure {@link isRenderAcceptable} gate below — the server makes the
 * Claude call, this decides what the answer means. Pinning the contract here means
 * an angle name, a status value, or the accept rule can't drift between the job
 * that produces a render and the card that renders it.
 *
 * Dependency-free (no db, no image SDK, no zod) so it is safe in a client bundle;
 * the payload carries only already-public displayable URLs. Import via the
 * `@era/core/turnaround` subpath.
 */

/**
 * The three viewpoints a turnaround renders, in display order. `three_quarter`
 * leads because it reads most naturally beside a straight-on cutout; `side` and
 * `back` complete the rotation. Kept as an `as const` tuple so it is the ONE
 * source of truth both {@link TurnaroundAngle} and the per-angle prompt/label maps
 * derive from — a new angle is added in exactly one place.
 */
export const TURNAROUND_ANGLES = ['three_quarter', 'side', 'back'] as const;

/** One of the three turnaround viewpoints — the element type of {@link TURNAROUND_ANGLES}. */
export type TurnaroundAngle = (typeof TURNAROUND_ANGLES)[number];

/**
 * One accepted render on the wire: which viewpoint it shows and where to display
 * it from. `displayUrl` is an already-public URL (the same public cutout bucket
 * the rest of the closet reads), so a client shows it with no follow-up auth.
 * Only renders that passed the QA gate ever become a `TurnaroundRender`.
 */
export interface TurnaroundRender {
  readonly angle: TurnaroundAngle;
  readonly displayUrl: string;
}

/**
 * Where an item's turnaround stands. `none` — not requested (or gated off);
 * `running` — generation/QA in flight; `complete` — finished, `renders` holds the
 * accepted angles (which may be fewer than three if some failed QA); `failed` —
 * the run errored and is retryable. A client picks its chrome straight from this.
 */
export type TurnaroundStatus = 'none' | 'running' | 'complete' | 'failed';

/**
 * The GET payload for an item's turnaround — everything the closet detail view
 * needs in one shape. `status` drives the UI state; `renders` carries ONLY the
 * accepted renders (a rejected angle never appears, so the client never shows a
 * QA-failed image); `categoryEnabled` echoes whether turnaround is on for this
 * item's category (server-resolved via `@era/core/turnaround-flags`) so the client
 * can hide the affordance entirely for an ineligible piece without re-deriving the
 * gate.
 */
export interface TurnaroundState {
  readonly status: TurnaroundStatus;
  readonly renders: readonly TurnaroundRender[];
  readonly categoryEnabled: boolean;
}

/**
 * Claude vision's structured QA verdict on a single generated render — the four
 * facts the {@link isRenderAcceptable} gate scores. `sameGarment`: is this the
 * SAME piece as the source cutout (not a similar-looking one)? `angleMatches`: is
 * it actually shown from the requested viewpoint? `cleanBackground`: is the
 * background the plain white the prompt asked for? `artifactSeverity`: how bad are
 * any generation artifacts (warped seams, melted hardware, extra sleeves) — `none`
 * / `minor` / `major`. The server fills this from the Claude call; the gate here
 * turns it into an accept/reject decision.
 */
export interface TurnaroundVerdict {
  readonly sameGarment: boolean;
  readonly angleMatches: boolean;
  readonly cleanBackground: boolean;
  readonly artifactSeverity: 'none' | 'minor' | 'major';
}

/**
 * The pure QA gate: does this render clear the bar to be shown? Two hard
 * requirements can never be traded away — it must be the same garment
 * (`sameGarment`) shown from the right viewpoint (`angleMatches`) — and a `major`
 * artifact always rejects, since a warped or mangled render misrepresents the
 * piece.
 *
 * The one nuance is the background. A perfectly clean render (`cleanBackground`)
 * passes on the two requirements alone. But a render whose background is NOT
 * perfectly clean is only passable when it is otherwise flawless —
 * `artifactSeverity === 'none'`: a faint shadow or off-white wash with zero
 * artifacts still reads as a trustworthy product shot, so we don't throw it away.
 * A dirty background PAIRED with even a `minor` artifact tips it below the bar and
 * rejects — the two small flaws compound into something that no longer looks
 * clean. `major` is out regardless, caught by the requirement above.
 *
 * Pure and total; never throws.
 */
export function isRenderAcceptable(verdict: TurnaroundVerdict): boolean {
  return (
    verdict.sameGarment &&
    verdict.angleMatches &&
    verdict.artifactSeverity !== 'major' &&
    (verdict.cleanBackground || verdict.artifactSeverity === 'none')
  );
}

/**
 * The shared lead-in every angle prompt opens with — the constant part of the
 * generation instruction, held here so it is reviewable and testable on its own.
 * It pins the two things that make a turnaround trustworthy: it must be the EXACT
 * SAME piece (color, pattern, material, proportions preserved — an identical item,
 * not a similar one), shot as clean studio product photography on a plain white
 * background with the piece alone (no person, mannequin, props, hands, or text).
 * {@link anglePrompt} appends the per-angle viewpoint from
 * {@link TURNAROUND_ANGLE_INSTRUCTIONS}.
 */
export const TURNAROUND_PROMPT_PREAMBLE =
  'Render the exact same garment or accessory shown in the reference image from a different viewpoint. ' +
  'It must be the identical item, not a similar one: preserve its color, pattern, material, and proportions precisely. ' +
  'Photograph it in a clean studio product-photography style, centered on a plain white background. ' +
  'Show only the item itself — no person, no mannequin, no props, no hands, and no text or watermark.';

/**
 * The per-angle viewpoint instruction, keyed by {@link TurnaroundAngle}. Kept as
 * named exported copy (not inlined in {@link anglePrompt}) so each viewpoint is
 * independently reviewable and the test suite can assert the exact wording. Each
 * line names the rotation concretely so the image model has no room to guess.
 */
export const TURNAROUND_ANGLE_INSTRUCTIONS: Record<TurnaroundAngle, string> = {
  three_quarter:
    'Show it from a three-quarter front angle, turned roughly 45 degrees so both the front and one side are visible.',
  side: 'Show it from a direct side profile, turned 90 degrees so only the side is visible.',
  back: 'Show it from directly behind, presenting the full back of the piece.',
};

/**
 * The finished generation prompt for one angle: the shared {@link
 * TURNAROUND_PROMPT_PREAMBLE} followed by that angle's viewpoint instruction. The
 * server passes the returned string to the image API; keeping composition here (a
 * pure function over exported constants) makes the exact prompt sent for any angle
 * reproducible and reviewable in one place.
 */
export function anglePrompt(angle: TurnaroundAngle): string {
  return `${TURNAROUND_PROMPT_PREAMBLE} ${TURNAROUND_ANGLE_INSTRUCTIONS[angle]}`;
}
