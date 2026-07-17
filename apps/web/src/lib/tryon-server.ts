/**
 * Server-only orchestration for virtual try-on — the FASHN garment-chain that
 * renders a saved outfit onto a user's avatar, behind the `@era/core` presigning
 * helpers and the pure {@link planTryonChain} planner.
 *
 * The flow, per outfit:
 *   1. CLAIM the render row (insert-onConflictDoNothing; the outfit id IS the PK,
 *      so the claimed row — not a transaction, which neon-http lacks — is both the
 *      idempotency guard and the cache). A live `running` row → already_running; a
 *      `complete` row whose signature still matches → that cached state; a STALE
 *      complete or a `failed` row → re-claimed with a single conditional update
 *      (turnaround idiom), the old object best-effort deleted.
 *   2. Reduce the outfit to an ordered, cutout-backed garment chain
 *      ({@link planTryonExecution}); the avatar base image is the first person
 *      input, and each FASHN call's output is fed forward (as base64) as the next
 *      call's person input. Only the FINAL image is persisted.
 *   3. Partial failure is skip-and-continue: a null step is dropped and the chain
 *      continues from the last good image. The run is `complete` iff at least one
 *      BASE-layer garment (dress/top/bottom) rendered, else `failed`.
 *
 * Every FASHN call records one `ai_usage` row (route `tryon`) so the per-subscriber
 * monthly cap can be counted. 150s wall budget; the POST awaits in-request (Railway
 * long-lived Node, turnaround precedent), GET is the resume/poll path.
 *
 * Never import from a client bundle — it talks to the database, R2, and FASHN.
 */
import { and, count, eq, gte } from 'drizzle-orm';

import {
  type AuthContext,
  deleteObjectsUnderPrefix,
  getAssetUrl,
  isEraTryonEnabled,
  itemsSignature,
  planTryonChain,
  requestUploadUrl,
} from '@era/core';
import type { TryonCategory, TryonInputItem, TryonState } from '@era/core/tryon';
import { type DbClient, aiUsage, createDbClient, items, outfitItems, outfitTryons } from '@era/db';

import { utcMonthStart } from './ai-usage.ts';
import { runTryon as runFashnTryon } from './fashn.ts';
import { serverStorageClient } from './storage-server.ts';

const moduleDb = createDbClient(process.env.DATABASE_URL!);

/** Per-subscriber, per-UTC-month ceiling on FASHN try-on calls (bounds worst-case spend). */
export const TRYON_MONTHLY_CALL_LIMIT = 100;

/** The `ai_usage.route` label for try-on spend (not a per-user AI rate-limited route). */
const TRYON_USAGE_ROUTE = 'tryon';
/** The `ai_usage.model` label for a FASHN try-on call. */
const TRYON_USAGE_MODEL = 'fashn-tryon-v1.6';
/** Flat per-call cost estimate for the spend log (FASHN try-on v1.6, plan-pinned). */
const TRYON_CALL_COST_USD = '0.075';

/** The `${userId}/tryon/…` sub-prefix the finished render lands under (avatars bucket). */
const TRYON_SUBDIR = 'tryon';
/** Final-render upload budget for the presigned PUT. */
const FINAL_UPLOAD_TIMEOUT_MS = 10_000;
/** Wall budget for the whole sequential chain — the POST awaits it in-request. */
const TRYON_WALL_BUDGET_MS = 150_000;

/** The base-layer categories: a run is only `complete` if one of these rendered. */
const BASE_CATEGORIES: ReadonlySet<TryonCategory> = new Set<TryonCategory>(['dress', 'top', 'bottom']);

/**
 * Server-authoritative try-on master flag, read raw from `ERA_TRYON_ENABLED` (NOT
 * through the zod schema, so a dormant feature never blocks boot — the plus-server
 * / turnaround precedent). When false EVERY avatar/try-on API route 404s and no
 * avatar is created and no render is queued. Shared by the avatar routes and the
 * outfit try-on routes.
 */
export function isTryonEnabledServer(): boolean {
  return isEraTryonEnabled(process.env.ERA_TRYON_ENABLED);
}

/**
 * One outfit member as the chain planner sees it: the pure {@link TryonInputItem}
 * fields plus the item's cutout key. An item with no cutout can't be rendered, so
 * {@link planTryonExecution} drops it from the executable chain.
 */
export interface TryonChainItem extends TryonInputItem {
  readonly imageCutoutPath: string | null;
}

/** One executable chain step: the resolved cutout to render and whether it's a base layer. */
interface ExecStep {
  readonly id: string;
  readonly category: TryonCategory;
  readonly cutoutPath: string;
  readonly isBase: boolean;
}

/**
 * Reduce an outfit's members to the ordered, cutout-backed chain the server
 * actually renders. Runs the pure {@link planTryonChain} (dedup + base-layer XOR +
 * layer order), then drops any planned step whose item has no cutout — you can't
 * render a garment with no image. Deterministic; never throws.
 */
export function planTryonExecution(chainItems: readonly TryonChainItem[]): ExecStep[] {
  const cutoutById = new Map(chainItems.map((item) => [item.id, item.imageCutoutPath]));
  const steps: ExecStep[] = [];
  for (const step of planTryonChain(chainItems)) {
    const cutoutPath = cutoutById.get(step.id);
    if (!cutoutPath) {
      continue;
    }
    steps.push({ id: step.id, category: step.category, cutoutPath, isBase: BASE_CATEGORIES.has(step.category) });
  }
  return steps;
}

/**
 * Load an outfit's members joined to their items, scoped to the owner, as the
 * planner's input. Only the fields the chain needs are selected; a foreign outfit
 * yields no rows (the caller has already enforced ownership).
 */
export async function loadTryonChainItems(db: DbClient, userId: string, outfitId: string): Promise<TryonChainItem[]> {
  const rows = await db
    .select({
      id: items.id,
      category: items.category,
      layerOrder: outfitItems.layerOrder,
      imageCutoutPath: items.imageCutoutPath,
    })
    .from(outfitItems)
    .innerJoin(items, eq(outfitItems.itemId, items.id))
    .where(and(eq(outfitItems.outfitId, outfitId), eq(items.userId, userId)));
  return rows.map((row) => ({
    id: row.id,
    category: row.category,
    layerOrder: row.layerOrder,
    imageCutoutPath: row.imageCutoutPath,
  }));
}

/** The per-subscriber monthly try-on-call cap decision, counted over `ai_usage` rows. */
export interface TryonLimitCheck {
  readonly allowed: boolean;
  readonly used: number;
  readonly limit: number;
}

/**
 * Count this UTC-month's FASHN try-on calls for a user and decide whether a run of
 * `plannedCalls` more would stay within the cap. Called BEFORE the claim — a false
 * `allowed` means the route returns its monthly-limit response. Keyed to
 * {@link utcMonthStart}. `plannedCalls` is the chain length, so a whole outfit's
 * worth of calls is reserved up front rather than mid-chain.
 */
export async function checkTryonMonthlyLimit(db: DbClient, userId: string, plannedCalls: number): Promise<TryonLimitCheck> {
  const [row] = await db
    .select({ used: count() })
    .from(aiUsage)
    .where(and(eq(aiUsage.userId, userId), eq(aiUsage.route, TRYON_USAGE_ROUTE), gte(aiUsage.createdAt, utcMonthStart())));
  const used = Number(row?.used ?? 0);
  return { allowed: used + plannedCalls <= TRYON_MONTHLY_CALL_LIMIT, used, limit: TRYON_MONTHLY_CALL_LIMIT };
}

/**
 * Load the current try-on state for an outfit: `none` when no row, else the row's
 * status with an owner-presigned image GET (only when `complete`), and `stale` —
 * true when a complete render's stored signature no longer matches
 * `currentSignature` (the outfit's garment set changed since it was rendered). An
 * image presign failure degrades to `null` rather than failing the read.
 */
export async function getTryonState(
  db: DbClient,
  ctx: AuthContext,
  outfitId: string,
  userId: string,
  currentSignature: string,
): Promise<TryonState> {
  const [row] = await db
    .select({
      status: outfitTryons.status,
      imagePath: outfitTryons.imagePath,
      itemsSignature: outfitTryons.itemsSignature,
      garmentsRendered: outfitTryons.garmentsRendered,
      garmentsTotal: outfitTryons.garmentsTotal,
    })
    .from(outfitTryons)
    .where(eq(outfitTryons.outfitId, outfitId))
    .limit(1);

  if (!row) {
    return { status: 'none', imageUrl: null, stale: false, garmentsRendered: 0, garmentsTotal: 0 };
  }

  let imageUrl: string | null = null;
  if (row.status === 'complete' && row.imagePath) {
    try {
      imageUrl = await getAssetUrl(serverStorageClient(), ctx, {
        bucket: 'avatars',
        key: row.imagePath,
        owner: { userId, isPrivate: true },
      });
    } catch (error) {
      console.error('[era-tryon] render presign failed; returning null imageUrl:', error);
    }
  }

  return {
    status: row.status,
    imageUrl,
    stale: row.status === 'complete' && row.itemsSignature !== currentSignature,
    garmentsRendered: row.garmentsRendered,
    garmentsTotal: row.garmentsTotal,
  };
}

/** Insert one try-on `ai_usage` row, best-effort — a spend-log miss must not fail the run. */
async function recordTryonUsage(db: DbClient, userId: string): Promise<void> {
  try {
    await db.insert(aiUsage).values({
      userId,
      route: TRYON_USAGE_ROUTE,
      model: TRYON_USAGE_MODEL,
      inputTokens: null,
      outputTokens: null,
      costUsd: TRYON_CALL_COST_USD,
    });
  } catch (error) {
    console.error('[era-tryon] failed to record try-on AI usage; continuing:', error);
  }
}

/** Stamp the render row failed with an ops-facing error string + the partial progress reached. */
async function failTryon(
  db: DbClient,
  outfitId: string,
  error: string,
  garmentsRendered: number,
  garmentsTotal: number,
): Promise<void> {
  await db
    .update(outfitTryons)
    .set({ status: 'failed', error, garmentsRendered, garmentsTotal })
    .where(eq(outfitTryons.outfitId, outfitId));
}

/** Best-effort single-object delete via the exact key as a prefix (uuid-named → matches only it). */
async function bestEffortDeleteObject(key: string): Promise<void> {
  try {
    const client = serverStorageClient();
    await deleteObjectsUnderPrefix(client, client.config.buckets.avatars, key);
  } catch (error) {
    console.error('[era-tryon] best-effort stale render delete failed; continuing:', error);
  }
}

/** PUT raw bytes to a presigned URL; throws on a non-2xx or a network/timeout error. */
async function putBytes(url: string, bytes: Uint8Array, contentType: string, timeoutMs: number): Promise<void> {
  const put = await fetch(url, {
    method: 'PUT',
    headers: { 'Content-Type': contentType },
    body: bytes as BodyInit,
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!put.ok) {
    throw new Error(`try-on render upload returned ${put.status}`);
  }
}

/** The outcome of a try-on run — success carries the fresh state; failure carries a route-mappable code. */
export type RunTryonResult =
  | { readonly ok: true; readonly state: TryonState }
  | { readonly ok: false; readonly code: 'already_running' | 'generation_failed' };

/**
 * Drive a try-on run for one outfit onto the user's avatar. Idempotent via the
 * claimed render row (the outfit id is the PK): a live `running` row →
 * already_running; a `complete` row that is NOT stale → its cached state; a STALE
 * complete or a `failed` row → re-claimed and re-rendered (a stale complete's old
 * object is best-effort deleted first). See the module doc for the chain rules.
 *
 * Caller contract: the route has already gated flag/session/origin/plus/ownership,
 * confirmed the avatar is `ready` (hence `avatarBaseImagePath` is present), planned
 * a NON-EMPTY chain, confirmed FASHN is configured, and reserved the monthly cap.
 */
export async function runTryon(
  ctx: AuthContext,
  userId: string,
  outfitId: string,
  avatarBaseImagePath: string,
  chainItems: readonly TryonChainItem[],
  currentSignature: string,
  db: DbClient = moduleDb,
): Promise<RunTryonResult> {
  const steps = planTryonExecution(chainItems);
  const garmentsTotal = steps.length;
  if (garmentsTotal === 0) {
    // The route guards this (400 no_garments), but guard defensively too.
    return { ok: false, code: 'generation_failed' };
  }

  // 1) CLAIM — the PK conflict is the concurrency guard + the render cache.
  const [claimed] = await db
    .insert(outfitTryons)
    .values({ outfitId, userId, status: 'running', itemsSignature: currentSignature, garmentsTotal, garmentsRendered: 0 })
    .onConflictDoNothing()
    .returning();

  if (!claimed) {
    const [existing] = await db
      .select({ status: outfitTryons.status, itemsSignature: outfitTryons.itemsSignature, imagePath: outfitTryons.imagePath })
      .from(outfitTryons)
      .where(eq(outfitTryons.outfitId, outfitId))
      .limit(1);
    if (!existing || existing.status === 'running') {
      return { ok: false, code: 'already_running' };
    }
    if (existing.status === 'complete') {
      if (existing.itemsSignature === currentSignature) {
        // Fresh cache hit — nothing to re-render.
        return { ok: true, state: await getTryonState(db, ctx, outfitId, userId, currentSignature) };
      }
      // Stale complete → re-claim in a single conditional update, then drop the old object.
      const [reclaimed] = await db
        .update(outfitTryons)
        .set({ status: 'running', itemsSignature: currentSignature, garmentsTotal, garmentsRendered: 0, error: null, imagePath: null })
        .where(and(eq(outfitTryons.outfitId, outfitId), eq(outfitTryons.status, 'complete')))
        .returning();
      if (!reclaimed) {
        return { ok: false, code: 'already_running' };
      }
      if (existing.imagePath) {
        await bestEffortDeleteObject(existing.imagePath);
      }
    } else {
      // failed → re-claim in a single conditional update.
      const [reclaimed] = await db
        .update(outfitTryons)
        .set({ status: 'running', itemsSignature: currentSignature, garmentsTotal, garmentsRendered: 0, error: null })
        .where(and(eq(outfitTryons.outfitId, outfitId), eq(outfitTryons.status, 'failed')))
        .returning();
      if (!reclaimed) {
        return { ok: false, code: 'already_running' };
      }
    }
  }

  const client = serverStorageClient();

  // 2) Person input starts as the avatar base image (owner-presigned GET).
  let personInput: string;
  try {
    personInput = await getAssetUrl(client, ctx, {
      bucket: 'avatars',
      key: avatarBaseImagePath,
      owner: { userId, isPrivate: true },
    });
  } catch (error) {
    console.error('[era-tryon] avatar base presign failed:', error);
    await failTryon(db, outfitId, 'avatar_presign_failed', 0, garmentsTotal);
    return { ok: false, code: 'generation_failed' };
  }

  // 3) Sequential chain: each success feeds forward as the next person input.
  const startedAt = Date.now();
  let garmentsRendered = 0;
  let baseRendered = false;
  let finalBytes: Uint8Array | null = null;

  for (const step of steps) {
    if (Date.now() - startedAt > TRYON_WALL_BUDGET_MS) {
      console.error('[era-tryon] wall budget exhausted mid-chain; finalizing with what rendered');
      break;
    }
    let garmentUrl: string;
    try {
      garmentUrl = await getAssetUrl(client, ctx, {
        bucket: 'items-cutout',
        key: step.cutoutPath,
        owner: { userId, isPrivate: true },
      });
    } catch (error) {
      console.error('[era-tryon] garment presign failed; skipping step:', error);
      continue;
    }

    const outBytes = await runFashnTryon(personInput, garmentUrl, step.category);
    // The FASHN call is billable whether or not it yields usable bytes; record it.
    await recordTryonUsage(db, userId);
    if (!outBytes) {
      // Partial failure: skip this garment and continue from the last good image.
      continue;
    }

    garmentsRendered += 1;
    if (step.isBase) {
      baseRendered = true;
    }
    finalBytes = outBytes;
    // Feed the composite forward as the next call's person input (base64 data URL).
    personInput = `data:image/png;base64,${Buffer.from(outBytes).toString('base64')}`;
  }

  // 4) Complete iff at least one BASE-layer garment rendered; else failed.
  if (garmentsRendered >= 1 && baseRendered && finalBytes) {
    let imagePath: string;
    try {
      const { url, key } = await requestUploadUrl(client, ctx, {
        bucket: 'avatars',
        ownerId: userId,
        ext: 'png',
        contentType: 'image/png',
        subdir: TRYON_SUBDIR,
      });
      await putBytes(url, finalBytes, 'image/png', FINAL_UPLOAD_TIMEOUT_MS);
      imagePath = key;
    } catch (error) {
      console.error('[era-tryon] final render upload failed:', error);
      await failTryon(db, outfitId, 'render_upload_failed', garmentsRendered, garmentsTotal);
      return { ok: false, code: 'generation_failed' };
    }
    await db
      .update(outfitTryons)
      .set({ status: 'complete', imagePath, garmentsRendered, garmentsTotal, error: null })
      .where(eq(outfitTryons.outfitId, outfitId));
    return { ok: true, state: await getTryonState(db, ctx, outfitId, userId, currentSignature) };
  }

  await failTryon(db, outfitId, 'no_base_layer_rendered', garmentsRendered, garmentsTotal);
  return { ok: false, code: 'generation_failed' };
}

/** Compute the current garment-set signature for an outfit's chain items (the staleness key). */
export function currentTryonSignature(chainItems: readonly TryonChainItem[]): string {
  return itemsSignature(chainItems);
}
