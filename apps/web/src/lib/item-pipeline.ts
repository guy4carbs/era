/**
 * Shared item-creation pipeline.
 *
 * Turns raw image bytes (already in, or destined for, the private items-raw
 * bucket) into a persisted `items` row. Two enrichment stages run and BOTH are
 * dormant until their provider key is configured; either one failing never fails
 * the pipeline, it only leaves its column empty:
 *
 *   1. Background removal (remove.bg) writes a cutout PNG to the cutout bucket.
 *   2. Vision classification (Claude) fills category / colors / pattern / brand
 *      / name.
 *
 * When neither runs (or both fail) the item is still saved with a placeholder
 * category and name (plus any caller-supplied prefill) so the client confirm
 * screen can force a manual review. The returned `processed` flags tell the
 * caller which stages produced data.
 *
 * Both `/api/process-item` (source `photo`) and `/api/import-from-url` (source
 * `link`) call this so the enrichment + persistence behaviour stays identical
 * across entry points. Callers own their own HTTP concerns (auth, request
 * validation, HTTP status mapping); this module owns enrichment, persistence,
 * and — when `rawBytes` is omitted — fetching the raw object from R2.
 *
 * Security: all R2 access goes through the @era/core presigning helpers
 * (getAssetUrl for the private raw GET, requestUploadUrl for the cutout PUT) so
 * this module never holds R2 credentials and never touches the S3 SDK directly.
 * A supplied `rawKey` MUST live under the caller's own prefix — getAssetUrl
 * re-checks that, and callers are expected to have validated it too.
 */
import Anthropic from '@anthropic-ai/sdk';

import { type AuthContext, getAssetUrl, requestUploadUrl } from '@era/core';
import { type Item, type ItemCategory, createDbClient, itemCategory, items } from '@era/db';

import { serverStorageClient } from './storage-server.ts';

const db = createDbClient(process.env.DATABASE_URL!);

// Per-stage time budgets, in milliseconds. Total wall time stays under 20s.
const RAW_FETCH_TIMEOUT_MS = 6_000;
const BG_REMOVAL_TIMEOUT_MS = 8_000;
const VISION_TIMEOUT_MS = 10_000;

// Media types Claude vision accepts. Raw avif uploads are skipped for vision.
const VISION_MEDIA_TYPES = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp']);
type VisionMediaType = 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp';

// Garment classification, mapped onto the camelCase items columns at insert.
interface Classification {
  readonly category: ItemCategory;
  readonly name: string | null;
  readonly brand: string | null;
  readonly colorPrimary: string | null;
  readonly colors: string[] | null;
  readonly pattern: string | null;
}

const CLASSIFY_PROMPT = [
  'Classify this single garment or accessory from the image using the classify_garment tool.',
  '- category: exactly one of the allowed values.',
  '- color_primary: one lowercase color word for the dominant color.',
  '- colors: 2-4 lowercase color words present in the item.',
  '- pattern: one of solid, striped, checked, floral, graphic, animal, other, or null if unclear.',
  '- brand: the brand name only if it is clearly visible, otherwise null.',
  "- name: a short garment name, e.g. 'White cotton shirt'.",
].join('\n');

/**
 * True only for a real, operator-supplied key. The committed .env.example ships
 * obvious placeholders (change-me..., sk-ant-xxxx...); treating those as
 * configured would fire a request that can only fail, so we reject them and keep
 * the stage dormant. Mirrors the guard in derive-style-profile and lib/auth.
 */
function isRealCredential(value: string | undefined): value is string {
  if (!value) {
    return false;
  }
  return !value.startsWith('change-me') && !value.startsWith('sk-ant-xxxx');
}

// Best-effort media type for the raw bytes: the served content-type, else ext.
function resolveMediaType(rawKey: string, servedContentType: string | null): string {
  if (servedContentType) {
    return servedContentType;
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

// Length caps for model-supplied tag strings (Sentinel LOW: bound stored text).
// This is server-side data, so we truncate-or-null rather than reject.
const NAME_MAX = 120;
const SHORT_TEXT_MAX = 64; // brand, colorPrimary, pattern
const COLORS_MAX = 8;
const COLOR_ITEM_MAX = 32;

// Truncate a non-empty string to `max`; empty/whitespace-only collapses to null.
function capText(value: unknown, max: number): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const capped = value.slice(0, max);
  return capped.length > 0 ? capped : null;
}

// Validate the vision tool output into a Classification, or null when unusable.
function coerceClassification(input: unknown): Classification | null {
  if (typeof input !== 'object' || input === null) {
    return null;
  }
  const raw = input as Record<string, unknown>;
  const category = raw.category;
  if (typeof category !== 'string' || !(itemCategory.enumValues as readonly string[]).includes(category)) {
    return null;
  }
  const colors = Array.isArray(raw.colors)
    ? raw.colors.filter((c): c is string => typeof c === 'string').slice(0, COLORS_MAX).map((c) => c.slice(0, COLOR_ITEM_MAX))
    : null;
  return {
    category: category as ItemCategory,
    name: capText(raw.name, NAME_MAX),
    brand: capText(raw.brand, SHORT_TEXT_MAX),
    colorPrimary: capText(raw.color_primary, SHORT_TEXT_MAX),
    colors: colors && colors.length > 0 ? colors : null,
    pattern: capText(raw.pattern, SHORT_TEXT_MAX),
  };
}

/**
 * Background removal (dormant without BG_REMOVAL_API_KEY). On success, stores the
 * cutout PNG under the caller's prefix in the cutout bucket via a presigned PUT
 * and returns its key; on ANY failure/timeout returns null so the item still
 * saves without a cutout.
 */
async function removeBackground(ctx: AuthContext, userId: string, rawBytes: Uint8Array, mediaType: string): Promise<string | null> {
  const apiKey = process.env.BG_REMOVAL_API_KEY;
  if (!isRealCredential(apiKey)) {
    return null;
  }
  try {
    const form = new FormData();
    form.append('image_file', new Blob([rawBytes as BlobPart], { type: mediaType }), 'image');
    form.append('size', 'auto');
    form.append('format', 'png');

    const response = await fetch('https://api.remove.bg/v1.0/removebg', {
      method: 'POST',
      headers: { 'X-Api-Key': apiKey },
      body: form,
      signal: AbortSignal.timeout(BG_REMOVAL_TIMEOUT_MS),
    });
    if (!response.ok) {
      console.error('[era-process] bg removal returned', response.status);
      return null;
    }
    const cutoutBytes = new Uint8Array(await response.arrayBuffer());

    // requestUploadUrl mints the cutout key ({userId}/{uuid}.png) and a presigned
    // PUT; owner-scoped, so the caller can only write under their own prefix.
    const { url, key } = await requestUploadUrl(serverStorageClient(), ctx, {
      bucket: 'items-cutout',
      ownerId: userId,
      ext: 'png',
      contentType: 'image/png',
    });
    const put = await fetch(url, {
      method: 'PUT',
      headers: { 'Content-Type': 'image/png' },
      body: cutoutBytes as BodyInit,
      signal: AbortSignal.timeout(BG_REMOVAL_TIMEOUT_MS),
    });
    if (!put.ok) {
      console.error('[era-process] cutout upload returned', put.status);
      return null;
    }
    return key;
  } catch (error) {
    console.error('[era-process] bg removal failed; continuing without a cutout:', error);
    return null;
  }
}

/**
 * Vision classification (dormant without ANTHROPIC_API_KEY, and skipped for media
 * types Claude cannot read). Uses a forced tool call for structured output.
 * Returns the parsed classification, or null on any failure so the item saves
 * with placeholder tags for manual review.
 */
async function classify(rawBytes: Uint8Array, mediaType: string): Promise<Classification | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!isRealCredential(apiKey) || !VISION_MEDIA_TYPES.has(mediaType)) {
    return null;
  }
  try {
    const client = new Anthropic({ apiKey, maxRetries: 1 });
    const response = await client.messages.create(
      {
        model: 'claude-opus-4-8',
        max_tokens: 1024,
        tools: [
          {
            name: 'classify_garment',
            description: 'Record the classification of the single garment or accessory in the image.',
            input_schema: {
              type: 'object',
              properties: {
                category: { type: 'string', enum: [...itemCategory.enumValues] },
                color_primary: { type: 'string' },
                colors: { type: 'array', items: { type: 'string' } },
                pattern: { type: ['string', 'null'], enum: ['solid', 'striped', 'checked', 'floral', 'graphic', 'animal', 'other', null] },
                brand: { type: ['string', 'null'] },
                name: { type: 'string' },
              },
              required: ['category', 'name'],
            } as Anthropic.Tool.InputSchema,
          },
        ],
        tool_choice: { type: 'tool', name: 'classify_garment' },
        messages: [
          {
            role: 'user',
            content: [
              { type: 'image', source: { type: 'base64', media_type: mediaType as VisionMediaType, data: Buffer.from(rawBytes).toString('base64') } },
              { type: 'text', text: CLASSIFY_PROMPT },
            ],
          },
        ],
      },
      { timeout: VISION_TIMEOUT_MS },
    );
    const toolUse = response.content.find((block) => block.type === 'tool_use');
    return toolUse ? coerceClassification(toolUse.input) : null;
  } catch (error) {
    console.error('[era-process] vision classification failed; saving placeholder tags:', error);
    return null;
  }
}

/** Persistence source for a pipeline run. Mirrors the `item_source` enum. */
export type PipelineSource = 'photo' | 'link' | 'email_import';

/**
 * Caller-supplied fallback fields, used only when the vision stage does not
 * override them. Import flows fill these from scraped product metadata; the
 * photo flow leaves them undefined.
 */
export interface ItemPrefill {
  readonly name?: string | null;
  readonly brand?: string | null;
  // Decimal string, numeric(12,2)-safe (validated by the caller).
  readonly purchasePrice?: string | null;
  // 3-letter uppercase ISO code, or null (validated by the caller).
  readonly currency?: string | null;
}

export interface PipelineInput {
  readonly userId: string;
  // items-raw key ({userId}/{uuid}.{ext}) the row's imageRawPath points at.
  readonly rawKey: string;
  // Raw image bytes. When omitted, they are fetched from items-raw via rawKey.
  readonly rawBytes?: Uint8Array;
  // Media type of rawBytes; used only when rawBytes is supplied.
  readonly contentType?: string | null;
  readonly source: PipelineSource;
  readonly prefill?: ItemPrefill;
}

export interface PipelineDeps {
  readonly ctx: AuthContext;
}

export interface PipelineResult {
  readonly item: Item;
  readonly processed: { readonly bg: boolean; readonly vision: boolean };
}

export type PipelineErrorCode = 'raw_unavailable' | 'save_failed';

/**
 * Signals a pipeline stage failure the caller must map to an HTTP status:
 *   - `raw_unavailable`: the raw object could not be fetched (only when the
 *     caller omitted rawBytes) → 502.
 *   - `save_failed`: the items row could not be persisted → 500.
 * Enrichment failures are NOT errors — they leave columns empty and still save.
 */
export class PipelineError extends Error {
  constructor(
    readonly code: PipelineErrorCode,
    cause?: unknown,
  ) {
    super(code, { cause });
    this.name = 'PipelineError';
  }
}

/**
 * Run background removal + vision (concurrently), then persist the item.
 * @throws {PipelineError} `raw_unavailable` (raw fetch failed) or `save_failed`
 *   (insert failed). Never throws for enrichment failures.
 */
export async function processItemPipeline(deps: PipelineDeps, input: PipelineInput): Promise<PipelineResult> {
  const { ctx } = deps;
  const { userId, rawKey, source, prefill } = input;

  // Resolve the bytes + media type: use the caller's bytes when given, else
  // fetch the raw object via an owner-scoped presigned GET (private bucket).
  let rawBytes: Uint8Array;
  let mediaType: string;
  if (input.rawBytes) {
    rawBytes = input.rawBytes;
    mediaType = input.contentType ?? resolveMediaType(rawKey, null);
  } else {
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
      console.error('[era-process] failed to fetch raw object:', error);
      throw new PipelineError('raw_unavailable', error);
    }
  }

  // Both enrichment stages need the raw bytes and are independent — run them
  // concurrently to keep total wall time within budget.
  const [cutoutPath, classification] = await Promise.all([
    removeBackground(ctx, userId, rawBytes, mediaType),
    classify(rawBytes, mediaType),
  ]);

  try {
    const [row] = await db
      .insert(items)
      .values({
        userId,
        // Placeholder default: the confirm screen forces a manual review, so a
        // best-guess category is fine and items.category is NOT NULL.
        category: classification?.category ?? 'top',
        // items.name is NOT NULL; vision wins, else the caller's prefill, else a
        // placeholder until the confirm screen forces the user to set a name.
        name: classification?.name ?? prefill?.name ?? 'New item',
        brand: classification?.brand ?? prefill?.brand ?? null,
        colorPrimary: classification?.colorPrimary ?? null,
        colors: classification?.colors ?? null,
        pattern: classification?.pattern ?? null,
        imageRawPath: rawKey,
        imageCutoutPath: cutoutPath,
        source,
        purchasePrice: prefill?.purchasePrice ?? null,
        currency: prefill?.currency ?? null,
        tagsConfirmed: false,
        archived: false,
      })
      .returning();

    if (!row) {
      throw new Error('insert returned no row');
    }
    return {
      item: row,
      processed: { bg: cutoutPath !== null, vision: classification !== null },
    };
  } catch (error) {
    console.error('[era-process] failed to persist item:', error);
    throw new PipelineError('save_failed', error);
  }
}
