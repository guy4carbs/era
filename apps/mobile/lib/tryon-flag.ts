/**
 * Era mobile — the avatar / virtual try-on feature flag (cosmetic client gate).
 *
 * Answers one question for the mobile client: "should we offer 'See it on you'
 * and the avatar onboarding?" The value is read from
 * `EXPO_PUBLIC_ERA_TRYON_ENABLED` and judged by {@link isEraTryonEnabled} in
 * `@era/core` (exact-string 'true' discipline), so web and mobile decide the same
 * way. A deliberate clone of {@link eraTurnaroundEnabled} in `lib/turnaround-flag.ts`.
 *
 * This flag is COSMETIC — it only decides whether the affordance, the onboarding
 * route, and the settings section render. The server's `ERA_TRYON_ENABLED` is the
 * real gate: with it off every avatar/try-on API route 404s and no avatar is ever
 * created and no render is ever queued, so a fat-fingered client flag can never
 * actually open the feature or spend a credit.
 */
import { isEraTryonEnabled } from '@era/core/tryon-flags';

/**
 * True only when this build was given `EXPO_PUBLIC_ERA_TRYON_ENABLED=true`. Read
 * once at module load — the env var is inlined at build time, so it never changes
 * within a running app. Cosmetic; see the module doc.
 */
export const eraTryonEnabled: boolean = isEraTryonEnabled(
  process.env.EXPO_PUBLIC_ERA_TRYON_ENABLED,
);
