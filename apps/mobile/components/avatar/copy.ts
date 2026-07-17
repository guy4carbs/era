/**
 * Avatar surface — a SMALL set of mobile-local labels that the frozen
 * `@era/core` `strings.tryon` block does not (yet) carry: the photo-step heading
 * and add-photo action, and the Settings status/entry/delete rows. Everything
 * user-facing that DOES exist in core (consent copy, progress, stale, deletion
 * counts, the paywall badge) is consumed from `strings.tryon` directly — this file
 * is only the gap.
 *
 * CONTRACT NOTE (Harbor → Forge/Nova): these are candidates to promote into
 * `strings.tryon` when the core string contract reopens, so web and mobile share
 * one voice for the settings/onboarding chrome. Kept in Era's calm, plain voice to
 * match. Mobile-owned and isolated here so the promotion is a single move.
 */

/** Labels the core `strings.tryon` block doesn't cover yet — see the module doc. */
export const avatarCopy = {
  /** Photo-step heading — plain, names what to add. */
  photoHeading: 'Add 1–3 photos of yourself',
  /** Photo-step helper line — sets the expectation without pressure. */
  photoHelp: 'A clear, front-on photo works best. You can add up to three.',
  /** The action that opens the photo picker. */
  addPhoto: 'Add a photo',
  /** Continue from the photo step into avatar creation. */
  continueToCreate: 'Create my avatar',
  /** Remove-photo affordance label (per-thumbnail, accessibility). */
  removePhoto: 'Remove photo',

  /** Settings section heading for the avatar controls. */
  settingsTitle: 'Your avatar',
  /** Settings row for a user with no avatar yet — routes into onboarding. */
  createRow: 'Create your avatar',
  /** Settings status line once the avatar is ready, from its creation date. */
  statusReady: (createdAt: string): string => `Avatar ready · created ${formatDate(createdAt)}`,
  /** Settings status line when the last creation failed — routes back into onboarding to retry. */
  statusFailed: "Your avatar didn't finish — tap to try again.",
  /** Destructive settings row that opens the delete-confirm sheet. */
  deleteRow: 'Delete avatar',
  /** Delete-confirm sheet heading. */
  deleteTitle: 'Delete your avatar?',
  /** Delete-confirm sheet body — plain about what goes and that it's permanent. */
  deleteBody:
    'This permanently deletes your avatar and every outfit render made from it. This can’t be undone.',
  /** The destructive confirm action in the delete sheet. */
  deleteConfirm: 'Delete avatar',
} as const;

/**
 * Format an ISO timestamp as a plain, locale-aware date (no time). Falls back to
 * the raw string if it doesn't parse, so a malformed `createdAt` never throws in a
 * status line.
 */
function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}
