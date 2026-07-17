/**
 * @era/core — the in-flow checkout feature flag. PURE and CLIENT-SAFE.
 *
 * In-flow checkout is Era's flag-gated cross-store cart surface: the user adds
 * pieces from different retailers while browsing, then completes ONE checkout
 * inside Era (powered by Rye's universal checkout API) for the retailers the
 * operator has personally sandbox-verified; everyone else keeps the unchanged
 * affiliate tap-out. This module answers one question and nothing else: "is the
 * checkout surface turned on?" It is a deliberate clone of {@link isEraTryonEnabled}
 * (see `tryon-flags.ts`) — same exact-string discipline — kept as its own function
 * so the checkout gate reads independently of the try-on gate and the two can
 * diverge without entangling.
 *
 * Dependency-free (no db, no env loader), so web and mobile client bundles import
 * it through the `@era/core/checkout-flags` subpath without pulling in the
 * server-tainted barrel. Never throws.
 */

/**
 * Master feature flag for the entire in-flow checkout surface. True ONLY for the
 * exact string 'true' — any other value (unset, '1', 'yes', 'TRUE', a typo) reads
 * as off, so a fat-fingered flag can never half-open a payment-adjacent feature
 * that places real orders and handles buyer PII. The caller supplies the raw value
 * it gates on: the server reads `env.ERA_CHECKOUT_ENABLED` (server-authoritative —
 * when off, every cart/checkout API route 404s and no checkout intent is ever
 * created), the web client `NEXT_PUBLIC_ERA_CHECKOUT_ENABLED`, the mobile client
 * `EXPO_PUBLIC_ERA_CHECKOUT_ENABLED`. The client flags are COSMETIC (they decide
 * what UI to render); the server flag is the real gate. Never throws.
 */
export function isEraCheckoutEnabled(flag: string | undefined): boolean {
  return flag === 'true';
}
