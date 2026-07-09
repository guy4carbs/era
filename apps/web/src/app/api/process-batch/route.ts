/**
 * POST /api/process-batch  { rawKey: string }
 *
 * Bulk multi-item capture: one already-uploaded flat-lay photo (several garments
 * laid out together, PUT to items-raw via /api/upload-url) becomes many wardrobe
 * items in one call. The server segments the photo into per-item boxes
 * (`segmentFlatLay`), crops each box out with sharp, stores each crop under the
 * caller's own prefix, and runs every crop through the SAME `processItemPipeline`
 * a single photo add uses (source `photo`, the box label as name prefill,
 * `tagsConfirmed` false), so a batch-imported item is identical to one added
 * alone. The response feeds a batch confirm screen.
 *
 * This route owns only the HTTP concerns; the orchestration (segmentation
 * dispatch, crop geometry + clamping, bounded concurrency, per-item failure
 * isolation, per-call metering) lives in {@link processBatchPipeline}.
 *
 * AI metering (batch-aware, never bypassed). A batch costs 1 segmentation call +
 * up to 12 vision classifications. We gate UP FRONT — global brake, then require
 * `process-item` daily headroom for at least segmentation + 1 item
 * ({@link hasBatchHeadroom}) — then meter each real call AS IT RUNS by recording
 * one `process-item` usage row: one after the segmentation call fires, one after
 * each crop whose pipeline succeeds. A batch therefore draws down the caller's
 * existing `process-item` daily budget one slot per real call (no new route/limit
 * needed), and a failed crop records nothing, mirroring single-item add exactly.
 *
 * Crop key shape: each crop is stored as a first-class raw item image,
 * `{userId}/{uuid}.jpg`, via the audited `requestUploadUrl` presign path (never
 * the S3 SDK directly) — the same shape and code path a single photo upload uses,
 * so `items.imageRawPath` points at a real raw object that the confirm screen and
 * any future re-processing can read.
 *
 * Responses:
 *   - 401 { error: 'unauthenticated' }       no session
 *   - 403 { error: 'forbidden' }             cross-origin POST, or rawKey not under the caller's prefix
 *   - 400 { error: 'invalid' }               missing/blank rawKey
 *   - 503 { retryable: true, reason: 'ai_paused' }   global AI brake engaged
 *   - 429 { error: 'daily_limit', message }  no headroom for a batch today
 *   - 502 { error: 'raw_unavailable' }       the flat-lay raw object could not be fetched
 *   - 413 { error: 'too_large' }             the raw photo exceeds the input cap
 *   - 200 { items: [{ id, name, category, imageUrl }...], failed, reason? }
 *       reason: 'segmentation_unavailable' (dormant / unreadable media) |
 *               'no_items_found' (model returned nothing) — present only when items is empty.
 */
import Sharp from 'sharp';
import { NextResponse } from 'next/server';

import { type AuthContext, AuthzError, getAssetUrl, requestUploadUrl, requireUser } from '@era/core';
import { strings } from '@era/core/strings';
import { createDbClient } from '@era/db';

import { auth } from '../../../lib/auth.ts';
import { checkDailyLimit, checkGlobalAiGate, recordUsage } from '../../../lib/ai-usage.ts';
import { hasBatchHeadroom, processBatchPipeline, type PixelRect } from '../../../lib/flatlay-batch.ts';
import { segmentFlatLay } from '../../../lib/flatlay-segment.ts';
import { PipelineError, processItemPipeline } from '../../../lib/item-pipeline.ts';
import { itemDisplayUrl } from '../../../lib/outfit-server.ts';
import { serverStorageClient } from '../../../lib/storage-server.ts';

const db = createDbClient(process.env.DATABASE_URL!);

/** Wall-clock budget for the flat-lay raw fetch (mirrors item-pipeline). */
const RAW_FETCH_TIMEOUT_MS = 6_000;
/** Time budget for storing a single crop PUT. */
const STORE_TIMEOUT_MS = 10_000;
/**
 * Input cap for the flat lay. The photo add path has no committed byte cap (the
 * client downscales to ≤1600px), so we apply the task's 15MB default here.
 */
const MAX_INPUT_BYTES = 15 * 1024 * 1024;

/** Media types Claude vision (and thus segmentation) can read. */
const VISION_MEDIA_TYPES = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp']);

/**
 * True only for a real, operator-supplied key — obvious `.env.example`
 * placeholders keep the feature dormant. Mirrors the guard in item-pipeline and
 * flatlay-segment.
 */
function isRealCredential(value: string | undefined): value is string {
  if (!value) {
    return false;
  }
  return !value.startsWith('change-me') && !value.startsWith('sk-ant-xxxx');
}

/** Same origin resolver used by the other mutating browser POSTs (waitlist, shop). */
function isSameOrigin(request: Request): boolean {
  const origin = request.headers.get('origin');
  if (!origin) {
    return true;
  }
  const host = request.headers.get('host');
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

/** Best-effort media type for the raw bytes: served content-type, else extension. */
function resolveMediaType(rawKey: string, servedContentType: string | null): string {
  if (servedContentType) {
    return servedContentType.split(';')[0]!.trim().toLowerCase();
  }
  const ext = rawKey.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg';
    case 'png':
      return 'image/png';
    case 'webp':
      return 'image/webp';
    case 'avif':
      return 'image/avif';
    default:
      return 'application/octet-stream';
  }
}

export async function POST(request: Request): Promise<NextResponse> {
  const sessionResult = await auth.api.getSession({ headers: request.headers });
  const ctx: AuthContext = { userId: sessionResult?.user.id ?? null };

  let userId: string;
  try {
    userId = requireUser(ctx);
  } catch (error) {
    if (error instanceof AuthzError) {
      return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
    }
    throw error;
  }

  // Mutating POST: reject a cross-site browser request (a missing Origin — a
  // non-browser client — is allowed, matching the other mutating routes).
  if (!isSameOrigin(request)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const body: unknown = await request.json().catch(() => null);
  const rawKey = (body as { rawKey?: unknown } | null)?.rawKey;
  if (typeof rawKey !== 'string' || rawKey.length === 0) {
    return NextResponse.json({ error: 'invalid' }, { status: 400 });
  }
  // Owner binding: the key must live under the caller's prefix, so a caller can
  // never batch-process another user's object.
  if (!rawKey.startsWith(`${userId}/`)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  // Global AI brake (B3): kill-switch or the day's global cap. A batch is pure AI
  // spend, so a closed gate defers it (retryable — the raw upload is safe in R2).
  const globalGate = await checkGlobalAiGate(db);
  if (!globalGate.open) {
    return NextResponse.json({ retryable: true, reason: 'ai_paused' }, { status: 503 });
  }

  // Per-user daily headroom for a whole batch (segmentation + at least one item),
  // metered on the shared process-item budget. No headroom → the same 429 the
  // single add returns.
  const check = await checkDailyLimit(db, userId, 'process-item');
  if (!hasBatchHeadroom(check)) {
    return NextResponse.json({ error: 'daily_limit', message: strings.ovi.limitReachedProcessing }, { status: 429 });
  }

  // Fetch the flat-lay raw object via an owner-scoped presigned GET (private).
  let rawBytes: Uint8Array;
  let mediaType: string;
  try {
    const getUrl = await getAssetUrl(serverStorageClient(), ctx, {
      bucket: 'items-raw',
      key: rawKey,
      owner: { userId, isPrivate: true },
    });
    const rawResponse = await fetch(getUrl, { signal: AbortSignal.timeout(RAW_FETCH_TIMEOUT_MS) });
    if (!rawResponse.ok) {
      throw new Error(`raw fetch returned ${rawResponse.status}`);
    }
    rawBytes = new Uint8Array(await rawResponse.arrayBuffer());
    mediaType = resolveMediaType(rawKey, rawResponse.headers.get('content-type'));
  } catch (error) {
    console.error('[era-batch] failed to fetch flat-lay raw object:', error);
    return NextResponse.json({ error: 'raw_unavailable' }, { status: 502 });
  }

  if (rawBytes.byteLength > MAX_INPUT_BYTES) {
    return NextResponse.json({ error: 'too_large' }, { status: 413 });
  }

  // Segmentation can only fire with a real key AND a vision-readable media type;
  // otherwise the call would never happen and the reason is "unavailable".
  const segmentationActive = isRealCredential(process.env.ANTHROPIC_API_KEY) && VISION_MEDIA_TYPES.has(mediaType);

  const storage = serverStorageClient();
  const result = await processBatchPipeline(
    {
      segment: (bytes, mt) => segmentFlatLay(bytes, mt),
      imageSize: async (bytes) => {
        const meta = await Sharp(bytes).metadata();
        return { width: meta.width ?? 0, height: meta.height ?? 0 };
      },
      cropJpeg: async (bytes, rect: PixelRect) =>
        new Uint8Array(
          await Sharp(bytes)
            .extract({ left: rect.left, top: rect.top, width: rect.width, height: rect.height })
            .jpeg()
            .toBuffer(),
        ),
      storeCrop: async (cropBytes) => {
        const { url, key } = await requestUploadUrl(storage, ctx, {
          bucket: 'items-raw',
          ownerId: userId,
          ext: 'jpg',
          contentType: 'image/jpeg',
        });
        const put = await fetch(url, {
          method: 'PUT',
          headers: { 'Content-Type': 'image/jpeg' },
          body: cropBytes as BodyInit,
          signal: AbortSignal.timeout(STORE_TIMEOUT_MS),
        });
        if (!put.ok) {
          throw new Error(`crop upload returned ${put.status}`);
        }
        return key;
      },
      runPipeline: async ({ rawKey: cropKey, rawBytes: cropBytes, label }) => {
        try {
          const pipelineResult = await processItemPipeline(
            { ctx },
            { userId, rawKey: cropKey, rawBytes: cropBytes, contentType: 'image/jpeg', source: 'photo', prefill: { name: label } },
          );
          return pipelineResult.item;
        } catch (error) {
          // Normalize so the orchestrator's per-item isolation treats it as one
          // failed crop (never a whole-batch 500).
          throw error instanceof PipelineError ? new Error(error.code) : error;
        }
      },
      // Best-effort per-call accounting on the shared process-item budget.
      meter: () => recordUsage(db, userId, 'process-item', { model: null }),
    },
    { rawBytes, mediaType, segmentationActive },
  );

  // Shape each created row for the confirm screen, resolving a signed display URL
  // (cutout when bg removal landed, else the raw crop) for the caller as owner.
  const items = await Promise.all(
    result.items.map(async (item) => ({
      id: item.id,
      name: item.name,
      category: item.category,
      imageUrl: await itemDisplayUrl(storage, ctx, item, { userId, isPrivate: true }),
    })),
  );

  return NextResponse.json({
    items,
    failed: result.failed,
    ...(result.reason ? { reason: result.reason } : {}),
  });
}
