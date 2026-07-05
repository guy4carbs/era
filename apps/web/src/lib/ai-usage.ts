/**
 * AI cost guardrails — per-user daily rate limits and spend logging for the three
 * metered AI routes (ovi-chat, process-item, derive-style-profile).
 *
 * Every metered call writes one `ai_usage` row: dormant/deterministic paths log a
 * null-model, $0 row (so the call still counts against the per-user daily limit),
 * and a real Claude call logs its model + token counts so `estimateCostUsd` can
 * price the spend. `checkDailyLimit` gates before the paid work; `recordUsage`
 * logs after it; `dailySpend` rolls the day up for the admin spend query.
 *
 * The route ceilings and pricing live in `@era/core` (`aiDailyLimit`,
 * `estimateCostUsd`); this module owns only the DB reads/writes. It never holds a
 * secret — it takes a `DbClient` so routes pass the client they already built and
 * tests can inject a fake.
 */
import { and, count, eq, gte, lt, sql } from 'drizzle-orm';

import {
  type AiRoute,
  type UsageCheck,
  aiDailyLimit,
  estimateCostUsd,
  globalSpendAllows,
  readGlobalAiGate,
} from '@era/core';
import { type DbClient, aiUsage } from '@era/db';

/**
 * Midnight (00:00:00.000) UTC of the given instant's day. The rate-limit window
 * and the spend rollup are both keyed to the UTC calendar day, so the boundary
 * is computed once here and reused. Pure and side-effect free.
 */
export function utcDayStart(now: Date = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

/** One UTC day in milliseconds — the upper bound of a day window. */
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Count today's calls for a user on a route and decide whether one more is
 * allowed. `used` is the number of `ai_usage` rows since the start of the current
 * UTC day; `limit` is the route's ceiling (`aiDailyLimit`, env-tunable); `allowed`
 * is `used < limit`. Called BEFORE the paid work — a false `allowed` means the
 * route returns its limit-reached response instead of doing the work.
 */
export async function checkDailyLimit(db: DbClient, userId: string, route: AiRoute): Promise<UsageCheck> {
  const [row] = await db
    .select({ used: count() })
    .from(aiUsage)
    .where(and(eq(aiUsage.userId, userId), eq(aiUsage.route, route), gte(aiUsage.createdAt, utcDayStart())));

  const used = Number(row?.used ?? 0);
  const limit = aiDailyLimit(route);
  return { allowed: used < limit, used, limit, route };
}

/** The optional spend/token detail a route records after a metered call. */
export interface RecordUsageOptions {
  readonly model?: string | null;
  readonly inputTokens?: number;
  readonly outputTokens?: number;
  readonly costUsd?: number;
}

/**
 * Insert one `ai_usage` row for a completed call. When `costUsd` is omitted it is
 * computed from the model + token counts via `estimateCostUsd` (null model / no
 * tokens → 0), so the deterministic/dormant paths log a real zero.
 *
 * Best-effort: a logging failure is swallowed and logged, never rethrown — a
 * spend-log write must not 500 the user's actual work. (The pre-flight
 * `checkDailyLimit`, by contrast, surfaces its failures.)
 */
export async function recordUsage(db: DbClient, userId: string, route: AiRoute, opts: RecordUsageOptions = {}): Promise<void> {
  const model = opts.model ?? null;
  const costUsd = opts.costUsd ?? estimateCostUsd(model, opts.inputTokens, opts.outputTokens);
  try {
    await db.insert(aiUsage).values({
      userId,
      route,
      model,
      inputTokens: opts.inputTokens ?? null,
      outputTokens: opts.outputTokens ?? null,
      // cost_usd is numeric → Drizzle expects a string.
      costUsd: costUsd.toString(),
    });
  } catch (error) {
    console.error('[era-ai-usage] failed to record AI usage; continuing:', error);
  }
}

/** The rolled-up AI spend for a single UTC day. */
export interface DailySpend {
  readonly totalUsd: number;
  readonly byRoute: Record<string, number>;
  readonly count: number;
}

/** Options for {@link dailySpend}: scope to one user, and/or pick the UTC day. */
export interface DailySpendOptions {
  readonly userId?: string;
  readonly date?: Date;
}

/**
 * Sum `cost_usd` and count rows for a UTC day, grouped by route. Scoped to one
 * user when `userId` is given, otherwise across all users (the admin/global
 * view). Defaults to the current UTC day; pass `date` to roll up a past day.
 */
export async function dailySpend(db: DbClient, opts: DailySpendOptions = {}): Promise<DailySpend> {
  const start = utcDayStart(opts.date ?? new Date());
  const end = new Date(start.getTime() + DAY_MS);

  const window = and(gte(aiUsage.createdAt, start), lt(aiUsage.createdAt, end));
  const where = opts.userId ? and(eq(aiUsage.userId, opts.userId), window) : window;

  const rows = await db
    .select({
      route: aiUsage.route,
      totalUsd: sql<string>`coalesce(sum(${aiUsage.costUsd}), 0)`,
      count: sql<number>`count(*)::int`,
    })
    .from(aiUsage)
    .where(where)
    .groupBy(aiUsage.route);

  let totalUsd = 0;
  let total = 0;
  const byRoute: Record<string, number> = {};
  for (const row of rows) {
    const usd = Number(row.totalUsd);
    byRoute[row.route] = usd;
    totalUsd += usd;
    total += Number(row.count);
  }

  return { totalUsd, byRoute, count: total };
}

/**
 * Total AI spend (USD) across ALL users for the current UTC day — the running
 * figure the global daily cap (B3) is compared against before a live LLM call.
 * Keyed to the same UTC-day window as {@link checkDailyLimit} and
 * {@link dailySpend} (via {@link utcDayStart}), so the global cap and the
 * per-user limits roll over together. One aggregate `sum(cost_usd)` over the day;
 * an empty day sums to 0. Only worth spending — it is read exclusively when a cap
 * is actually configured, see {@link checkGlobalAiGate}.
 */
export async function sumAiSpendTodayUsd(db: DbClient, now: Date = new Date()): Promise<number> {
  const start = utcDayStart(now);
  const end = new Date(start.getTime() + DAY_MS);
  const [row] = await db
    .select({ totalUsd: sql<string>`coalesce(sum(${aiUsage.costUsd}), 0)` })
    .from(aiUsage)
    .where(and(gte(aiUsage.createdAt, start), lt(aiUsage.createdAt, end)));
  return Number(row?.totalUsd ?? 0);
}

/** Why the global AI gate is closed — surfaced for logging/analytics; `ok` = open. */
export type GlobalGateReason = 'ok' | 'kill_switch' | 'global_cap';

/** The global gate's verdict for one request. `open: false` → no live model may run. */
export interface GlobalGateDecision {
  readonly open: boolean;
  readonly reason: GlobalGateReason;
}

/**
 * The app-wide AI brake (B3), evaluated once per request BEFORE any live LLM call
 * and layered ABOVE the per-user daily limit. When `open` is false the route MUST
 * degrade to its deterministic / graceful path — it must not call Anthropic.
 *
 * Order, cheapest-first:
 *   1. Kill-switch (`AI_KILL_SWITCH`) — refuses everything, zero DB work.
 *   2. Global daily cap (`AI_GLOBAL_DAILY_USD`) — ONLY when a cap is set do we sum
 *      the day's spend and block once it has reached the ceiling.
 * With neither control set the gate is inert (`open`, no DB round-trip), so a
 * dormant deployment pays nothing for it. The only throw path is a DB error from
 * the spend sum, which runs solely under an active cap.
 */
export async function checkGlobalAiGate(
  db: DbClient,
  source: Record<string, string | undefined> = process.env,
): Promise<GlobalGateDecision> {
  const gate = readGlobalAiGate(source);
  if (gate.killed) return { open: false, reason: 'kill_switch' };
  if (gate.capUsd !== null) {
    const spentTodayUsd = await sumAiSpendTodayUsd(db);
    if (!globalSpendAllows(spentTodayUsd, source)) return { open: false, reason: 'global_cap' };
  }
  return { open: true, reason: 'ok' };
}
