/**
 * @era/core — AI usage limits and spend estimation (SERVER-side).
 *
 * The single source of truth for per-user daily rate limits on the metered AI
 * routes, and for turning a Claude model + token counts into a USD cost for the
 * spend log. This module reads `process.env` for optional limit overrides, so it
 * is server-ish — it is exported from the SERVER-tainted barrel (`@era/core`),
 * never a client subpath.
 *
 * Forge's DB helper codes to `UsageCheck` and passes `estimateCostUsd(...)` into
 * `recordUsage`. Routes call `aiDailyLimit(route)` to know the ceiling and
 * `estimateCostUsd(...)` to price the call.
 *
 * The limit overrides are OPTIONAL env vars — the app must boot without them, so
 * they are NOT in `serverEnvSchema`. When unset or non-numeric, the sane default
 * applies. Env vars (per user, per UTC day):
 *   - OVI_CHAT_DAILY_LIMIT        (default 50)
 *   - PROCESS_ITEM_DAILY_LIMIT    (default 100)
 *   - DERIVE_PROFILE_DAILY_LIMIT  (default 20)
 *   - RANK_PRODUCTS_DAILY_LIMIT   (default 30)
 */

/**
 * The metered AI routes. `rank-products` powers the Shop tab's LLM-scored
 * ranking; the deterministic ranker in `@era/core/shop` runs the same feed
 * unmetered when that path is dormant (no key), so this limit only bites when
 * the model is live.
 */
export type AiRoute = 'ovi-chat' | 'process-item' | 'derive-style-profile' | 'rank-products';

interface RouteLimit {
  readonly envVar: string;
  readonly fallback: number;
}

/** Per-route default ceiling and the env var that overrides it. */
const ROUTE_LIMITS: Readonly<Record<AiRoute, RouteLimit>> = {
  'ovi-chat': { envVar: 'OVI_CHAT_DAILY_LIMIT', fallback: 50 },
  'process-item': { envVar: 'PROCESS_ITEM_DAILY_LIMIT', fallback: 100 },
  'derive-style-profile': { envVar: 'DERIVE_PROFILE_DAILY_LIMIT', fallback: 20 },
  'rank-products': { envVar: 'RANK_PRODUCTS_DAILY_LIMIT', fallback: 30 },
};

/**
 * Parse an env override into a positive integer, ignoring anything that isn't a
 * finite positive number (empty, non-numeric, zero, negative, NaN) so a
 * fat-fingered var falls back to the default rather than disabling the limit.
 */
function parseLimitOverride(raw: string | undefined): number | null {
  if (raw === undefined) return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.floor(n);
}

/**
 * The per-user, per-UTC-day request ceiling for an AI route. Reads the route's
 * optional env override, falling back to the sane default. Never throws.
 */
export function aiDailyLimit(
  route: AiRoute,
  source: Record<string, string | undefined> = process.env,
): number {
  const limit = ROUTE_LIMITS[route];
  return parseLimitOverride(source[limit.envVar]) ?? limit.fallback;
}

/**
 * The shape Forge's DB helper returns after checking today's usage for a user on
 * a route. Routes read `allowed` to gate, and surface `used`/`limit` to the UI
 * (and to Quill's limit-reached voice).
 */
export interface UsageCheck {
  readonly allowed: boolean;
  readonly used: number;
  readonly limit: number;
  readonly route: AiRoute;
}

interface ModelCost {
  /** USD per 1M input tokens. */
  readonly inputPerM: number;
  /** USD per 1M output tokens. */
  readonly outputPerM: number;
}

/**
 * Claude model pricing, USD per 1M tokens. Cross-checked against the claude-api
 * skill's model table (2026-07). The Opus 4.x family shares one price point; the
 * table is keyed by exact model id and matched case-insensitively.
 */
const MODEL_COST_PER_1M: Readonly<Record<string, ModelCost>> = {
  'claude-fable-5': { inputPerM: 10, outputPerM: 50 },
  'claude-opus-4-8': { inputPerM: 5, outputPerM: 25 },
  'claude-opus-4-7': { inputPerM: 5, outputPerM: 25 },
  'claude-opus-4-6': { inputPerM: 5, outputPerM: 25 },
  'claude-sonnet-4-6': { inputPerM: 3, outputPerM: 15 },
  'claude-haiku-4-5': { inputPerM: 1, outputPerM: 5 },
};

/**
 * Estimate the USD cost of a single Claude call from its model and token counts.
 * Deterministic and side-effect free.
 *
 * Returns 0 when there is nothing to price — a null model (the deterministic /
 * dormant paths that never touch Claude) or absent token counts — so those paths
 * log a real zero rather than a guess. An unknown model also prices at 0 (we log
 * the spend we can attribute; an unpriced model shouldn't fabricate a number).
 */
export function estimateCostUsd(
  model: string | null,
  inputTokens?: number,
  outputTokens?: number,
): number {
  if (model === null) return 0;
  const cost = MODEL_COST_PER_1M[model.toLowerCase()];
  if (cost === undefined) return 0;

  const input = Number.isFinite(inputTokens) ? Math.max(0, inputTokens as number) : 0;
  const output = Number.isFinite(outputTokens) ? Math.max(0, outputTokens as number) : 0;
  if (input === 0 && output === 0) return 0;

  return (input * cost.inputPerM + output * cost.outputPerM) / 1_000_000;
}
