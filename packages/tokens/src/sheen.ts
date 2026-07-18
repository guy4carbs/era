/**
 * sheen — a diagonal specular gradient overlay.
 *
 * A 135deg wash from a faint white to transparent by 60% of the run (§3:
 * `linear-gradient(135deg, rgba(255,255,255,0.05), transparent 60%)`; dark mode
 * dims the wash to 0.04 so it doesn't glow). Laid over a surface to fake a
 * glancing light. Use ONLY on item cards and primary buttons — it is the
 * "premium" cue and loses meaning if applied broadly.
 */

export const sheen = {
  angleDeg: 135,
  // The gradient reaches transparent at 60% of the diagonal, not the far corner.
  stopPercent: 60,
  from: {
    light: 'rgba(255, 255, 255, 0.05)',
    dark: 'rgba(255, 255, 255, 0.04)',
  },
  to: 'rgba(255, 255, 255, 0)',
  // Ready-to-use CSS gradients per mode (web; RN uses from/to + stopPercent
  // as expo-linear-gradient colors + locations [0, 0.6]).
  gradient: {
    light: 'linear-gradient(135deg, rgba(255, 255, 255, 0.05), rgba(255, 255, 255, 0) 60%)',
    dark: 'linear-gradient(135deg, rgba(255, 255, 255, 0.04), rgba(255, 255, 255, 0) 60%)',
  },
} as const;
