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
import { and, eq, inArray } from 'drizzle-orm';

import { type AuthContext, getAssetUrl, type StorageClient } from '@era/core';
import { rankProducts, type RankedProduct, type ShopProduct, type WhyItemRef } from '@era/core/shop';
import type { OviItem, StyleProfileLite } from '@era/core/ovi';
import { type DbClient, items } from '@era/db';

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

// -----------------------------------------------------------------------------
// whyDetail thumbnail resolution — the ranker leaves each WhyItemRef.imageUrl
// UNDEFINED (the pure `@era/core/shop` path is client-safe and never touches the
// DB or R2). The server resolves the referenced owned closet items' cutout URLs
// here before returning, so a "why" detail sheet can show the actual pieces.
// -----------------------------------------------------------------------------

/**
 * Resolve a set of owned closet item ids to their thumbnail URLs. The lookup is
 * owner-scoped and returns only the ids it could resolve — an id with no cutout
 * (or not owned by the caller) is simply absent from the map, so its ref keeps
 * `imageUrl` undefined and the client shows a fallback.
 */
export type WhyThumbnailLookup = (ids: readonly string[]) => Promise<ReadonlyMap<string, string>>;

/** Every WhyItemRef id referenced across a page's whyDetail arrays, deduped. */
function collectWhyItemIds(products: readonly RankedProduct[]): string[] {
  const ids = new Set<string>();
  for (const product of products) {
    const detail = product.whyDetail;
    if (detail === null) {
      continue;
    }
    for (const ref of detail.completesWith) {
      ids.add(ref.id);
    }
    for (const ref of detail.similarTo) {
      ids.add(ref.id);
    }
  }
  return [...ids];
}

/** Copy a ref, attaching its resolved thumbnail when the lookup found one. */
function withRefImage(ref: WhyItemRef, urls: ReadonlyMap<string, string>): WhyItemRef {
  const imageUrl = urls.get(ref.id);
  return imageUrl !== undefined ? { ...ref, imageUrl } : ref;
}

/**
 * Populate each product's whyDetail refs (`completesWith`, `similarTo`) with the
 * owned closet items' thumbnail URLs from `lookup`. Pure over the products — the
 * only side effect is the injected lookup — so it is unit-testable with a stubbed
 * map. Returns the products unchanged (no lookup call) when no ref names an item.
 */
export async function attachWhyThumbnails(
  products: readonly RankedProduct[],
  lookup: WhyThumbnailLookup,
): Promise<RankedProduct[]> {
  const ids = collectWhyItemIds(products);
  if (ids.length === 0) {
    return [...products];
  }
  const urls = await lookup(ids);
  return products.map((product) => {
    const detail = product.whyDetail;
    if (detail === null) {
      return product;
    }
    return {
      ...product,
      whyDetail: {
        ...detail,
        completesWith: detail.completesWith.map((ref) => withRefImage(ref, urls)),
        similarTo: detail.similarTo.map((ref) => withRefImage(ref, urls)),
      },
    };
  });
}

/**
 * The live {@link WhyThumbnailLookup}: reads the caller's OWN closet items
 * (owner-scoped by `owner.userId`) and resolves each one's cutout to a display
 * URL. Cutout-only — an item with no `imageCutoutPath` is omitted (its ref keeps
 * a fallback). `getAssetUrl` yields the unsigned public cutout URL for a public
 * owner and a short-lived presigned GET for a private one, exactly as the closet
 * list does; it also guards that every key is under the owner's prefix.
 */
export function createItemThumbnailLookup(
  db: DbClient,
  storage: StorageClient,
  ctx: AuthContext,
  owner: { userId: string; isPrivate: boolean },
): WhyThumbnailLookup {
  return async (ids: readonly string[]): Promise<ReadonlyMap<string, string>> => {
    const urls = new Map<string, string>();
    if (ids.length === 0) {
      return urls;
    }
    const rows = await db
      .select({ id: items.id, imageCutoutPath: items.imageCutoutPath })
      .from(items)
      .where(and(inArray(items.id, [...ids]), eq(items.userId, owner.userId)));

    await Promise.all(
      rows.map(async (row) => {
        const key = row.imageCutoutPath;
        if (!key) {
          return;
        }
        const url = await getAssetUrl(storage, ctx, { bucket: 'items-cutout', key, owner });
        urls.set(row.id, url);
      }),
    );
    return urls;
  };
}
