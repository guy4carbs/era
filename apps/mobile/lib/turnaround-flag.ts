/**
 * Era mobile — the AI turnaround-views feature flag (cosmetic client gate).
 *
 * Answers one question for the mobile client: "should we offer the multi-angle
 * viewer on the closet detail?" The value is read from
 * `EXPO_PUBLIC_ERA_TURNAROUND_ENABLED` and judged by {@link isEraTurnaroundEnabled}
 * in `@era/core` (exact-string 'true' discipline), so web and mobile decide the
 * same way. Mirrors {@link eraFeedEnabled} in `lib/feed-flag.ts`.
 *
 * This flag is COSMETIC — it only decides whether the affordance and viewer
 * render. The server's `ERA_TURNAROUND_ENABLED` is the real gate: with it off the
 * turnaround API 404s and no render job is ever queued, so a fat-fingered client
 * flag can never actually open the feature.
 */
import { isEraTurnaroundEnabled } from '@era/core/turnaround-flags';

/**
 * True only when this build was given `EXPO_PUBLIC_ERA_TURNAROUND_ENABLED=true`.
 * Read once at module load — the env var is inlined at build time, so it never
 * changes within a running app. Cosmetic; see the module doc.
 */
export const eraTurnaroundEnabled: boolean = isEraTurnaroundEnabled(
  process.env.EXPO_PUBLIC_ERA_TURNAROUND_ENABLED,
);
