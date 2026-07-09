/**
 * Bulk flat-lay capture — the orchestration half of `POST /api/process-batch`.
 *
 * One uploaded flat-lay photo (several items laid out together) becomes many
 * wardrobe items: segment the photo into per-item boxes, crop each box out, and
 * run every crop through the SAME `processItemPipeline` a single photo add uses,
 * so a batch-imported item is indistinguishable from one added on its own. This
 * module owns ONLY the orchestration — segmentation dispatch, denormalize +
 * clamp + crop geometry, bounded concurrency, per-item failure isolation, and the
 * per-AI-call metering hook. Every side effect (the Anthropic segmentation call,
 * sharp cropping/sizing, R2 storage, the item pipeline, the usage write) is an
 * injected seam, so the whole contract is unit-testable with fakes and no route,
 * no sharp, no db, and no real key are needed. The route (`route.ts`) supplies the
 * real seams and owns all HTTP concerns (auth, validation, gates, status mapping).
 *
 * Coordinate contract (from `flatlay-segment.ts`): boxes are NORMALIZED to 0..1,
 * and x/y/w/h are clamped INDEPENDENTLY, so `x + width` may exceed 1. The crop
 * rect is therefore clamped to the image's real pixel bounds AFTER denormalizing;
 * a box that clamps to a sub-pixel rect is dropped as degenerate rather than sent
 * to the cropper.
 *
 * Metering: this module never records usage itself — it calls the injected
 * `meter()` once per AI call that actually fired (the segmentation call, then one
 * per crop whose pipeline SUCCEEDS), mirroring how `process-item` records one row
 * after a successful pipeline run. The route wires `meter` to `recordUsage(...,
 * 'process-item', { model: null })`; a batch therefore consumes the caller's
 * `process-item` daily budget one slot per real call, and never bypasses the
 * per-call accounting. A crop that fails records nothing (its item never saved),
 * exactly as `process-item` records nothing on a pipeline error.
 */
import type { Item } from '@era/db';

import type { SegmentBox } from './flatlay-segment.ts';

/** An integer pixel crop rectangle, already clamped to the source image bounds. */
export interface PixelRect {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

/** Default in-flight crop pipelines — bounds concurrent vision calls (not 12 at once). */
const DEFAULT_CONCURRENCY = 4;

/**
 * Injected side-effect seams. Production wiring lives in the route; tests pass
 * fakes. All are required except `concurrency`/`log`.
 */
export interface BatchDeps {
  /** Segment the flat lay into normalized boxes, or null when nothing usable. */
  readonly segment: (bytes: Uint8Array, mediaType: string) => Promise<SegmentBox[] | null>;
  /** Pixel dimensions of the source image (sharp metadata in production). */
  readonly imageSize: (bytes: Uint8Array) => Promise<{ width: number; height: number }>;
  /** Extract one clamped rect and re-encode as JPEG (sharp in production). */
  readonly cropJpeg: (bytes: Uint8Array, rect: PixelRect) => Promise<Uint8Array>;
  /** Store a crop under the caller's prefix; returns the items-raw key. */
  readonly storeCrop: (cropBytes: Uint8Array, index: number) => Promise<string>;
  /** Run the shared item pipeline on a crop; returns the persisted row. */
  readonly runPipeline: (args: { rawKey: string; rawBytes: Uint8Array; label: string }) => Promise<Item>;
  /** Record one metered AI call (best-effort; must never throw). */
  readonly meter: () => Promise<void>;
  /** Max concurrent crop pipelines. Defaults to {@link DEFAULT_CONCURRENCY}. */
  readonly concurrency?: number;
  /** Error sink. Defaults to `console.error`. */
  readonly log?: (message: string) => void;
}

export interface BatchInput {
  /** Raw bytes of the flat-lay photo. */
  readonly rawBytes: Uint8Array;
  /** Media type of the raw bytes (drives the vision call in `segment`). */
  readonly mediaType: string;
  /**
   * Whether segmentation can actually run: a real ANTHROPIC key AND a
   * vision-readable media type. When false the segmentation call would never
   * fire, so we return `segmentation_unavailable` without one and meter nothing.
   * The route computes this so this module stays free of env/credential logic.
   */
  readonly segmentationActive: boolean;
}

/** Why a batch returned no items, when it returned none. Omitted on success. */
export type BatchEmptyReason = 'segmentation_unavailable' | 'no_items_found';

export interface BatchResult {
  /** The successfully created item rows (≤ 12). */
  readonly items: Item[];
  /** Boxes that produced no item: degenerate geometry OR a crop/store/pipeline failure. */
  readonly failed: number;
  /** Present only when `items` is empty; distinguishes dormant from empty-model. */
  readonly reason?: BatchEmptyReason;
}

/**
 * Whether the caller has room to run a batch: it costs at least the segmentation
 * call plus one crop, so we require headroom for 2 calls up front rather than
 * starting a batch that dies mid-way. Pure; the route maps `false` to its
 * limit-reached (429) response, exactly as `process-item` does for a single add.
 */
export function hasBatchHeadroom(check: { used: number; limit: number }): boolean {
  return check.limit - check.used >= 2;
}

/**
 * Denormalize a 0..1 box to an integer pixel rect and clamp it INTO the image.
 *
 * The origin is clamped into `[0, dim-1]`, then each extent is clamped so the rect
 * cannot spill past the far edge (`left + width <= imgW`), which is the load-
 * bearing step: `segmentFlatLay` clamps x/y/w/h independently, so a raw box can
 * have `x + width > 1`. A rect that ends up under 1px on either side is degenerate
 * (nothing to crop) and returns null so the caller drops it.
 */
export function toPixelRect(box: SegmentBox, imgW: number, imgH: number): PixelRect | null {
  if (!Number.isFinite(imgW) || !Number.isFinite(imgH) || imgW < 1 || imgH < 1) {
    return null;
  }
  const left = Math.min(Math.max(Math.round(box.x * imgW), 0), imgW - 1);
  const top = Math.min(Math.max(Math.round(box.y * imgH), 0), imgH - 1);
  const width = Math.min(Math.round(box.width * imgW), imgW - left);
  const height = Math.min(Math.round(box.height * imgH), imgH - top);
  if (width < 1 || height < 1) {
    return null;
  }
  return { left, top, width, height };
}

/**
 * Run `worker` over `items` with at most `concurrency` in flight at once. Order-
 * independent: each worker owns its own result. Never rejects — a worker's own
 * error handling decides what a failure means (here, a counted `failed`).
 */
async function mapPool<T>(count: number, concurrency: number, worker: (index: number) => Promise<T>): Promise<T[]> {
  const results: T[] = new Array<T>(count);
  let next = 0;
  const runners = Array.from({ length: Math.min(concurrency, count) }, async () => {
    for (;;) {
      const index = next++;
      if (index >= count) {
        return;
      }
      results[index] = await worker(index);
    }
  });
  await Promise.all(runners);
  return results;
}

/**
 * Segment a flat-lay photo and turn each box into a persisted item.
 *
 * Never throws: segmentation dormancy, an empty model result, a bad image, and a
 * single crop's failure are all handled and reflected in the result. A crop
 * failure (crop, store, or pipeline) is isolated — it increments `failed` and the
 * remaining crops still land.
 */
export async function processBatchPipeline(deps: BatchDeps, input: BatchInput): Promise<BatchResult> {
  const log = deps.log ?? console.error;
  const concurrency = deps.concurrency ?? DEFAULT_CONCURRENCY;

  // Dormant / unsupported media: the segmentation call would never fire, so meter
  // nothing and report honestly. Distinct from "the model found no items" below.
  if (!input.segmentationActive) {
    return { items: [], failed: 0, reason: 'segmentation_unavailable' };
  }

  const boxes = await deps.segment(input.rawBytes, input.mediaType);
  // The segmentation call fired (real key + readable media) regardless of what it
  // returned, so it counts against the daily budget. Best-effort, like the crops.
  await deps.meter();

  if (boxes === null || boxes.length === 0) {
    return { items: [], failed: 0, reason: 'no_items_found' };
  }

  // Size the source once; without dimensions nothing can be cropped.
  let imgW: number;
  let imgH: number;
  try {
    const size = await deps.imageSize(input.rawBytes);
    imgW = size.width;
    imgH = size.height;
    if (!Number.isFinite(imgW) || !Number.isFinite(imgH) || imgW < 1 || imgH < 1) {
      throw new Error(`unusable image dimensions ${imgW}x${imgH}`);
    }
  } catch (error) {
    log(`[era-batch] could not size the flat lay; no crops possible: ${errName(error)}`);
    return { items: [], failed: boxes.length };
  }

  let failed = 0;
  const outcomes = await mapPool<Item | null>(boxes.length, concurrency, async (index) => {
    const box = boxes[index]!;
    const rect = toPixelRect(box, imgW, imgH);
    if (rect === null) {
      failed += 1;
      return null;
    }
    try {
      const cropBytes = await deps.cropJpeg(input.rawBytes, rect);
      const rawKey = await deps.storeCrop(cropBytes, index);
      const item = await deps.runPipeline({ rawKey, rawBytes: cropBytes, label: box.label });
      // Success → the crop's vision call counted; meter it (best-effort).
      await deps.meter();
      return item;
    } catch (error) {
      // One crop failing never sinks the batch — count it and keep going.
      log(`[era-batch] crop ${index} failed; skipping: ${errName(error)}`);
      failed += 1;
      return null;
    }
  });

  const items = outcomes.filter((item): item is Item => item !== null);
  return { items, failed };
}

/** Error class name only — never the message, which could echo request content. */
function errName(error: unknown): string {
  return error instanceof Error ? error.constructor.name : 'unknown error';
}
