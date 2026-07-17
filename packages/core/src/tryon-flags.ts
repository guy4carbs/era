/**
 * @era/core — the avatar / virtual try-on feature flag. PURE and CLIENT-SAFE.
 *
 * Virtual try-on is Era's flag-gated premium surface: a user builds a consented
 * avatar from their own photos, and "See it on you" renders a saved outfit onto
 * that avatar. This module answers one question and nothing else: "is the try-on
 * surface turned on?" It is a deliberate clone of {@link isEraTurnaroundEnabled}
 * (see `turnaround-flags.ts`) — same exact-string discipline — kept as its own
 * function so the try-on gate reads independently of the turnaround gate and the
 * two can diverge without entangling.
 *
 * Dependency-free (no db, no env loader), so web and mobile client bundles import
 * it through the `@era/core/tryon-flags` subpath without pulling in the
 * server-tainted barrel. Never throws.
 */

/**
 * Master feature flag for the entire avatar / try-on surface. True ONLY for the
 * exact string 'true' — any other value (unset, '1', 'yes', 'TRUE', a typo) reads
 * as off, so a fat-fingered flag can never half-open a feature that spends real
 * try-on credits and touches user photos. The caller supplies the raw value it
 * gates on: the server reads `env.ERA_TRYON_ENABLED` (server-authoritative — when
 * off, every avatar/try-on API route 404s and no avatar is ever created and no
 * render is ever queued), the web client `NEXT_PUBLIC_ERA_TRYON_ENABLED`, the
 * mobile client `EXPO_PUBLIC_ERA_TRYON_ENABLED`. The client flags are COSMETIC
 * (they decide what UI to render); the server flag is the real gate. Never throws.
 */
export function isEraTryonEnabled(flag: string | undefined): boolean {
  return flag === 'true';
}
