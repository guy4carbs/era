/**
 * POST /api/import-email  { rawEmail: string }
 *
 * Import wardrobe items from a retailer order-confirmation email. The raw RFC822
 * message is parsed (headers + text/html + text/plain) by lib/email-receipt.ts,
 * then a {@link ReceiptParser} chosen by the sender's domain lifts the line items
 * (lib/receipt-parsers/). Each line item is imported through the SAME url/image
 * pipeline as /api/import-from-url:
 *
 *   - With an image URL: fetch it through the SSRF gate (lib/url-import.ts),
 *     store it to items-raw, and run {@link processItemPipeline} (bg removal +
 *     vision) with source `email_import` and the receipt fields as prefill.
 *   - Without a usable image (no imageUrl, or the fetch/pipeline failed, or the
 *     AI budget is spent): save the item DIRECTLY as a draft — source
 *     `email_import`, `tagsConfirmed: false`, null image columns (items.image_raw_path
 *     is nullable). The purchase data is never lost just because there is no image.
 *
 * Every item lands as a DRAFT (`tagsConfirmed: false`) for the confirm screen.
 * Ingest transport (a mailbox webhook / inbound-email provider) is out of scope;
 * the client hands us one raw email per call. Session-gated + same-origin +
 * body-capped, mirroring the other mutating routes.
 *
 * AI cost: an item whose image runs the vision/bg pipeline is live AI spend, so it
 * is gated + metered exactly like /api/process-item — the global AI brake and the
 * per-user `process-item` daily limit form a budget for the whole receipt, and
 * each pipeline run records one `ai_usage` row under the `process-item` route.
 * Once the budget is spent (or the brake is engaged) the remaining items degrade
 * to image-less drafts (no AI), rather than 429-ing the whole receipt.
 *
 * Responses:
 *   - 401 { error: 'unauthenticated' }   no session
 *   - 403 { error: 'forbidden' }         cross-origin request
 *   - 400 { error: 'invalid' }           missing/blank/oversized/malformed email
 *   - 200 { imported: [{ id, name, category }], skipped: number }
 */
import { NextResponse } from 'next/server';

import { type AuthContext, AuthzError, requestUploadUrl, requireUser } from '@era/core';
import { createDbClient, items } from '@era/db';

import { auth } from '../../../lib/auth.ts';
import { checkDailyLimit, checkGlobalAiGate, recordUsage } from '../../../lib/ai-usage.ts';
import { EmailParseError, MAX_EMAIL_BYTES, type ReceiptItem, parseReceiptEmail } from '../../../lib/email-receipt.ts';
import { PipelineError, processItemPipeline } from '../../../lib/item-pipeline.ts';
import { parseReceipt } from '../../../lib/receipt-parsers/index.ts';
import { isSameOrigin } from '../../../lib/shop-query.ts';
import { serverStorageClient } from '../../../lib/storage-server.ts';
import { BlockedUrlError, FetchError, imageUploadTarget, readCapped, safeFetch } from '../../../lib/url-import.ts';

// Re-export the request/parser contract so the route file remains the documented
// home of the import-email types even though they are defined in the lib.
export type { ParsedEmail, ReceiptImportRequest, ReceiptItem, ReceiptParser } from '../../../lib/email-receipt.ts';

const db = createDbClient(process.env.DATABASE_URL!);

// Never import more than this many line items from one receipt.
const MAX_ITEMS_PER_RECEIPT = 25;
// The request envelope wraps a ≤1MB rawEmail; JSON-escaping can inflate it, so
// cap the read generously — the 1MB rawEmail cap is enforced by parseReceiptEmail.
const MAX_BODY_BYTES = 4 * 1024 * 1024;
const IMAGE_MAX_BYTES = 10 * 1024 * 1024;
const IMAGE_TIMEOUT_MS = 10_000;
const STORE_TIMEOUT_MS = 10_000;
const NAME_MAX = 120;

/** The response shape for one successfully-imported item. */
interface ImportedItem {
  readonly id: string;
  readonly name: string;
  readonly category: string;
}

/** Read the capped JSON body, or null (→ 400) on any failure. */
async function readBody(request: Request): Promise<Record<string, unknown> | null> {
  const declaredLength = Number(request.headers.get('content-length'));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) {
    return null;
  }
  const rawBody = await request.text().catch(() => '');
  if (rawBody.length === 0 || rawBody.length > MAX_BODY_BYTES) {
    return null;
  }
  try {
    const parsed: unknown = JSON.parse(rawBody);
    return typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
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

  // Mutating POST: reject a cross-origin caller (mirrors the other write routes).
  if (!isSameOrigin(request)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const body = await readBody(request);
  const rawEmail = body?.rawEmail;
  if (typeof rawEmail !== 'string' || rawEmail.length === 0 || rawEmail.length > MAX_EMAIL_BYTES) {
    return NextResponse.json({ error: 'invalid' }, { status: 400 });
  }

  // Parse the email and lift its line items. A malformed/oversized email is a 400;
  // a well-formed but unrecognized (non-receipt) email yields [] → imported: [].
  let receiptItems: ReceiptItem[];
  try {
    const email = parseReceiptEmail(rawEmail);
    receiptItems = parseReceipt(email).slice(0, MAX_ITEMS_PER_RECEIPT);
  } catch (error) {
    if (error instanceof EmailParseError) {
      return NextResponse.json({ error: 'invalid' }, { status: 400 });
    }
    throw error;
  }

  if (receiptItems.length === 0) {
    return NextResponse.json({ imported: [], skipped: 0 });
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

  return NextResponse.json({ imported, skipped });
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
    console.error('[era-import-email] unexpected error importing item with image:', error);
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
    console.error('[era-import-email] failed to persist image-less draft item:', error);
    return null;
  }
}
