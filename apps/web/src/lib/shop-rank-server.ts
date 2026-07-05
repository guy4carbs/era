/**
 * Server-only ranking for the Shop tab: the single decision point between the
 * deterministic ranker (live today) and the dormant Claude refinement path —
 * the exact shape of `lib/ovi-server.ts`'s `styleWithOvi`.
 *
 * Shop ranking NEVER dead-ends a browse. The deterministic `rankProducts`
 * (pure, closet-grounded, from `@era/core/shop`) is always computed and is the
 * value returned unless a real ANTHROPIC key is configured AND the caller is
 * under their daily `rank-products` limit AND Claude returns a valid refinement.
 * A missing key, a hit rate limit, or any LLM failure all degrade silently to the
 * deterministic ranking — a rate limit is a soft downgrade here, never an HTTP 429.
 *
 * Metering is charged only when the LLM actually does work: a real refinement
 * writes one priced `ai_usage` row; the dormant/degraded paths write nothing (no
 * model ran, so there is no cost and nothing to count). The `checkDailyLimit` gate
 * is wired now so it throttles the moment the paid path lands.
 *
 * Never import from a client bundle — reads secrets and the DB client.
 */
import { rankProducts, type RankedProduct, type ShopProduct } from '@era/core/shop';
import type { OviItem, StyleProfileLite } from '@era/core/ovi';
import type { DbClient } from '@era/db';

import { checkDailyLimit, checkGlobalAiGate, recordUsage } from './ai-usage.ts';
import { isRealCredential } from './ovi-server.ts';

/** Which path produced the ranking we returned. */
export type ShopRankSource = 'deterministic' | 'llm';

/** A ranked page plus its provenance. */
export interface ShopRankResult {
  products: RankedProduct[];
  source: ShopRankSource;
}

/** Model + token counts from a real Claude refinement, for the AI spend log. */
interface ShopRankUsage {
  model: string;
  inputTokens: number;
  outputTokens: number;
}

/**
 * Ask Claude to refine the deterministic ranking / `why` labels. DORMANT — the
 * Claude call is not built yet, so this always returns null and the caller uses
 * the deterministic ranking. When it lands it must: return a permutation of the
 * SAME products (never invent or drop a product), keep each `why` honest, and
 * report token usage so the caller can price the spend. Returning null on any
 * parse/timeout/API failure keeps the browse on the deterministic path.
 */
async function refineRankingWithLlm(
  apiKey: string,
  deterministic: readonly RankedProduct[],
  closet: readonly OviItem[],
  styleProfile: StyleProfileLite | null,
): Promise<{ products: RankedProduct[]; usage: ShopRankUsage } | null> {
  // Dormant: no model in the loop yet. The args are the future contract — the
  // Claude call will re-rank `deterministic` against `closet` + `styleProfile`
  // under `apiKey`. Referenced here so the signature stands until it lands.
  void [apiKey, deterministic, closet, styleProfile];
  return null;
}

/**
 * Rank a set of products against the caller's closet + style profile. Claude when
 * a real key is configured, the caller is under their daily limit, and it returns
 * a valid refinement; otherwise the deterministic ranker. Always resolves to a
 * real ranking of the SAME products — a browse never fails because the model did.
 */
export async function rankProductsForUser(
  db: DbClient,
  userId: string,
  products: readonly ShopProduct[],
  closet: readonly OviItem[],
  styleProfile: StyleProfileLite | null,
): Promise<ShopRankResult> {
  const deterministic = rankProducts(products, closet, styleProfile);

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!isRealCredential(apiKey)) {
    return { products: deterministic, source: 'deterministic' };
  }

  // Global AI brake (B3): the app-wide kill-switch, or the day's global spend at
  // or over the cap. When engaged we never touch the model — the browse still
  // returns a real, closet-grounded deterministic ranking (never a 429). Layered
  // ABOVE the per-user limit below; only queried once a real key is configured.
  const globalGate = await checkGlobalAiGate(db);
  if (!globalGate.open) {
    return { products: deterministic, source: 'deterministic' };
  }

  // A real key is configured. Gate on the per-user daily limit — but if it's hit,
  // DEGRADE to the deterministic ranking rather than 429-hard-fail the browse.
  const check = await checkDailyLimit(db, userId, 'rank-products');
  if (!check.allowed) {
    return { products: deterministic, source: 'deterministic' };
  }

  const refined = await refineRankingWithLlm(apiKey, deterministic, closet, styleProfile);
  if (refined) {
    await recordUsage(db, userId, 'rank-products', {
      model: refined.usage.model,
      inputTokens: refined.usage.inputTokens,
      outputTokens: refined.usage.outputTokens,
    });
    return { products: refined.products, source: 'llm' };
  }

  // Dormant / failed refinement: no model ran, so nothing is metered. Deterministic.
  return { products: deterministic, source: 'deterministic' };
}
