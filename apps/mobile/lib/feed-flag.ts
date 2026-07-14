/**
 * Era mobile — the Feed feature flag (cosmetic client gate).
 *
 * Answers one question for the mobile client: "should we render the feed
 * surface?" The value is read from `EXPO_PUBLIC_ERA_FEED_ENABLED` and judged by
 * {@link isEraFeedEnabled} in `@era/core` (exact-string 'true' discipline), so
 * web and mobile decide the same way.
 *
 * This flag is COSMETIC — it only decides whether the pager mounts. The server's
 * `ERA_FEED_ENABLED` is the real gate: with it off, every feed API route 404s, so
 * a fat-fingered client flag can never actually open the feed. Mirrors the Era+
 * `plus`-flag pattern.
 */
import { isEraFeedEnabled } from '@era/core/feed-flags';

/**
 * True only when this build was given `EXPO_PUBLIC_ERA_FEED_ENABLED=true`. Read
 * once at module load — the env var is inlined at build time, so it never changes
 * within a running app. Cosmetic; see the module doc.
 */
export const eraFeedEnabled: boolean = isEraFeedEnabled(process.env.EXPO_PUBLIC_ERA_FEED_ENABLED);
