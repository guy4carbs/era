/**
 * Shared server-side receipt-import core.
 *
 * Turns a list of {@link ReceiptItem}s (already lifted from a receipt email by a
 * {@link ReceiptParser}) into persisted DRAFT items, through the SAME url/image
 * pipeline the photo/link imports use. Two entry points delegate here so the
 * behaviour stays identical no matter how the email arrived:
 *
 *   - `POST /api/import-email` — the user PASTES a raw order email (session ctx).
 *   - `POST /api/webhooks/resend-inbound` — the user FORWARDS a receipt to their
 *     private inbound address; the webhook resolves the account by token and
 *     builds an AuthContext `{ userId }` for the presign helpers.
 *
 * Per item:
 *   - With an image URL: SSRF-gated fetch (lib/url-import) → store to items-raw →
 *     {@link processItemPipeline} (bg removal + vision) with source `email_import`
 *     and the receipt fields as prefill.
 *   - Without a usable image (no imageUrl, the fetch/pipeline failed, or the AI
 *     budget is spent): save the item DIRECTLY as an image-less draft so the
 *     purchase is never lost.
 *
 * Every item lands as a DRAFT (`tagsConfirmed: false`). The whole receipt shares
 * ONE AI budget (the global brake + the per-user `process-item` daily limit); once
 * it is spent the remaining items degrade to image-less drafts rather than 429-ing
 * the receipt. The import is capped at {@link MAX_ITEMS_PER_RECEIPT}.
 *
 * This module owns enrichment + persistence only; callers own their HTTP concerns
 * (auth, transport, response mapping). It does NOT own idempotency — the inbound
 * webhook dedupes upstream via `inbound_email_events` before it ever calls here.
 */
import { type AuthContext, requestUploadUrl } from '@era/core';
import { createDbClient, items } from '@era/db';

import { checkDailyLimit, checkGlobalAiGate, recordUsage } from './ai-usage.ts';
import type { ReceiptItem } from './email-receipt.ts';
import { PipelineError, processItemPipeline } from './item-pipeline.ts';
import { serverStorageClient } from './storage-server.ts';
import { BlockedUrlError, FetchError, imageUploadTarget, readCapped, safeFetch } from './url-import.ts';

const db = createDbClient(process.env.DATABASE_URL!);

/** Never import more than this many line items from one receipt. */
export const MAX_ITEMS_PER_RECEIPT = 25;
const IMAGE_MAX_BYTES = 10 * 1024 * 1024;
const IMAGE_TIMEOUT_MS = 10_000;
const STORE_TIMEOUT_MS = 10_000;
const NAME_MAX = 120;

/** One successfully-imported draft item, as the routes surface it. */
export interface ImportedItem {
  readonly id: string;
  readonly name: string;
  readonly category: string;
}

/** The result of importing a receipt's line items. */
export interface ReceiptImportOutcome {
  readonly imported: ImportedItem[];
  /** Items that failed even the image-less draft insert (a DB error). */
  readonly skipped: number;
}

/** Map a receipt line item's fields onto the shared pipeline prefill. */
function prefillFrom(item: ReceiptItem): {
  name: string | null;
  brand: string | null;
  purchasePrice: string | null;
  currency: string | null;
} {
  return {
    name: item.name,
    brand: item.brand ?? null,
    purchasePrice: item.price ?? null,
    currency: item.currency ?? null,
  };
}

/**
 * Import receipt line items as draft wardrobe items for `userId`. `ctx` authorizes
 * the R2 presigns (owner-scoped to `ctx.userId`, which MUST equal `userId`). The
 * list is capped at {@link MAX_ITEMS_PER_RECEIPT}; an empty list is a no-op that
 * returns `{ imported: [], skipped: 0 }` without any DB round-trips.
 */
export async function importReceiptItems(args: {
  readonly userId: string;
  readonly ctx: AuthContext;
  readonly items: readonly ReceiptItem[];
}): Promise<ReceiptImportOutcome> {
  const { userId, ctx } = args;
  const receiptItems = args.items.slice(0, MAX_ITEMS_PER_RECEIPT);

  if (receiptItems.length === 0) {
    return { imported: [], skipped: 0 };
  }

  // Compute the AI budget ONCE for the whole receipt: how many vision/bg pipeline
  // runs the global brake + the per-user daily limit still allow. Only worth the
  // DB round-trips when at least one item actually has an image to process.
  let visionBudget = 0;
  if (receiptItems.some((item) => item.imageUrl !== undefined)) {
    const gate = await checkGlobalAiGate(db);
    if (gate.open) {
      const check = await checkDailyLimit(db, userId, 'process-item');
      visionBudget = Math.max(0, check.limit - check.used);
    }
  }

  const imported: ImportedItem[] = [];
  let skipped = 0;

  for (const item of receiptItems) {
    let saved: ImportedItem | null = null;

    // Image-bearing item within the AI budget: run the full pipeline, then meter
    // the run under `process-item` (each run counts against the daily limit).
    if (item.imageUrl !== undefined && visionBudget > 0) {
      saved = await importWithImage(userId, ctx, item);
      if (saved !== null) {
        visionBudget -= 1;
        await recordUsage(db, userId, 'process-item', { model: null });
      }
    }

    // No image, no budget, or the image import failed → save an image-less draft
    // so the purchase is still captured (never lost). Only a failed DB insert here
    // counts as skipped.
    if (saved === null) {
      saved = await insertDraftItem(userId, item);
    }

    if (saved !== null) {
      imported.push(saved);
    } else {
      skipped += 1;
    }
  }

  return { imported, skipped };
}

/**
 * Import one receipt item that carries an image URL: SSRF-gated fetch → store to
 * items-raw → shared pipeline (source `email_import`). Returns the created item,
 * or null on ANY failure (the caller then degrades it to an image-less draft).
 */
async function importWithImage(userId: string, ctx: AuthContext, item: ReceiptItem): Promise<ImportedItem | null> {
  const imageUrl = item.imageUrl;
  if (imageUrl === undefined) return null;

  try {
    const { response } = await safeFetch(imageUrl, { accept: 'image/*', timeoutMs: IMAGE_TIMEOUT_MS });
    if (!response.ok) {
      response.body?.cancel().catch(() => {});
      return null;
    }
    const target = imageUploadTarget(response.headers.get('content-type') ?? '');
    if (target === null) {
      response.body?.cancel().catch(() => {});
      return null;
    }
    const imageBytes = await readCapped(response, IMAGE_MAX_BYTES);

    const { url: putUrl, key: rawKey } = await requestUploadUrl(serverStorageClient(), ctx, {
      bucket: 'items-raw',
      ownerId: userId,
      ext: target.ext,
      contentType: target.contentType,
    });
    const put = await fetch(putUrl, {
      method: 'PUT',
      headers: { 'Content-Type': target.contentType },
      body: imageBytes as BodyInit,
      signal: AbortSignal.timeout(STORE_TIMEOUT_MS),
    });
    if (!put.ok) {
      return null;
    }

    const result = await processItemPipeline(
      { ctx },
      { userId, rawKey, rawBytes: imageBytes, contentType: target.contentType, source: 'email_import', prefill: prefillFrom(item) },
    );
    return { id: result.item.id, name: result.item.name, category: result.item.category };
  } catch (error) {
    // A blocked/garbage image URL, a network failure, or a pipeline error all
    // reduce to "no image" — the item is still saved as a draft by the caller.
    if (error instanceof BlockedUrlError || error instanceof FetchError || error instanceof PipelineError) {
      return null;
    }
    console.error('[era-receipt-import] unexpected error importing item with image:', error);
    return null;
  }
}

/**
 * Persist a receipt item as an image-less draft (source `email_import`,
 * `tagsConfirmed: false`, null image columns). Placeholder category `top` — the
 * confirm screen forces a manual review anyway. Returns null on a DB failure.
 */
async function insertDraftItem(userId: string, item: ReceiptItem): Promise<ImportedItem | null> {
  try {
    const name = item.name.slice(0, NAME_MAX);
    const [row] = await db
      .insert(items)
      .values({
        userId,
        category: 'top',
        name: name.length > 0 ? name : 'New item',
        brand: item.brand ?? null,
        colorPrimary: null,
        colors: null,
        pattern: null,
        imageRawPath: null,
        imageCutoutPath: null,
        source: 'email_import',
        purchasePrice: item.price ?? null,
        currency: item.currency ?? null,
        tagsConfirmed: false,
        archived: false,
      })
      .returning();
    if (!row) return null;
    return { id: row.id, name: row.name, category: row.category };
  } catch (error) {
    console.error('[era-receipt-import] failed to persist image-less draft item:', error);
    return null;
  }
}
