/**
 * @era/core — the Feed feature flag. PURE and CLIENT-SAFE.
 *
 * The single question this module answers: "is the feed surface turned on?" It is
 * a deliberate clone of {@link isEraPlusEnabled} (see `plus.ts`) — same
 * exact-string discipline, same three-caller pattern — kept as its own function
 * so the feed's gate reads independently of the monetization gate and the two can
 * diverge without entangling.
 *
 * Dependency-free (no db, no env loader), so web and mobile client bundles import
 * it through the `@era/core/feed-flags` subpath without pulling in the
 * server-tainted barrel. Never throws.
 */

/**
 * Master feature flag for the entire feed surface. True ONLY for the exact string
 * 'true' — any other value (unset, '1', 'yes', 'TRUE', a typo) reads as off, so a
 * fat-fingered flag can never half-open the feed. The caller supplies the raw
 * value it gates on: the server reads `env.ERA_FEED_ENABLED` (server-authoritative
 * — when off, the feed API routes 404), the web client
 * `NEXT_PUBLIC_ERA_FEED_ENABLED`, the mobile client `EXPO_PUBLIC_ERA_FEED_ENABLED`.
 * The client flags are COSMETIC (they decide what UI to render); the server flag
 * is the real gate. Never throws.
 */
export function isEraFeedEnabled(flag: string | undefined): boolean {
  return flag === 'true';
}
