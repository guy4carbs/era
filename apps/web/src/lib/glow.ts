/**
 * The accent glow-shadow recipe, shared by every surface that carries Ovi's
 * halo — the OviFab, the rail's orb, and the nav glow dots. Extracted from
 * OviFab so the composition (`--shadow-e3` lift + an accent color-mix ring at
 * `--glow-blur`) lives in one place and the design-consistency guard sees a
 * single recipe rather than drifting copies.
 */

/** Accent glow shadow at a given opacity, layered above the e3 lift. */
export function glowShadow(opacity: number): string {
  const clamped = Math.min(1, Math.max(0, opacity));
  return `var(--shadow-e3), 0 0 var(--glow-blur) color-mix(in srgb, var(--color-accent) ${Math.round(
    clamped * 100,
  )}%, transparent)`;
}
