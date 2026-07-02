/**
 * sheen — a diagonal specular gradient overlay.
 *
 * A 135deg wash from a faint white to transparent, laid over a surface to fake
 * a glancing light. Use ONLY on item cards and primary buttons — it is the
 * "premium" cue and loses meaning if applied broadly.
 */

export const sheen = {
  angleDeg: 135,
  from: 'rgba(255, 255, 255, 0.05)',
  to: 'rgba(255, 255, 255, 0)',
} as const;
