/**
 * POST /api/process-item  { rawKey: string }
 *
 * Turn a freshly-uploaded raw image (already PUT to R2 via /api/upload-url) into
 * a persisted items row. Two enrichment stages run and BOTH are dormant until
 * their provider key is configured; either one failing never fails the request,
 * it only leaves its column empty:
 *
 *   1. Background removal (remove.bg) writes a cutout PNG to the cutout bucket.
 *   2. Vision classification (Claude) fills category / colors / pattern / brand
 *      / name.
 *
 * When neither runs (or both fail) the item is still saved with a placeholder
 * category and name so the client confirm screen can force a manual review. The
 * response processed flags tell the client which stages produced data.
 *
 * Security: rawKey MUST live under the caller's own prefix. All R2 access goes
 * through the @era/core presigning helpers (getAssetUrl for the private raw GET,
 * requestUploadUrl for the cutout PUT) so this route never holds R2 credentials
 * and never touches the S3 SDK directly.
 *
 * Timeout budget (total under 20s): raw GET at most 6s, then BG removal (8s) and
 * vision (10s) run concurrently, so wall time is about 6s + max(8s, 10s).
 *
 * Responses:
 *   - 401 { error: 'unauthenticated' }  no session
 *   - 400 { error: 'invalid' }          missing/blank rawKey
 *   - 403 { error: 'forbidden' }        rawKey not under the caller's prefix
 *   - 502 { error: 'raw_unavailable' }  the raw object could not be fetched
 *   - 500 { error: 'save_failed' }      persistence failed
 *   - 200 { item, processed: { bg, vision } }
 */
import Anthropic from '@anthropic-ai/sdk';
import { NextResponse } from 'next/server';

import { type AuthContext, AuthzError, getAssetUrl, requestUploadUrl, requireUser } from '@era/core';
import { type ItemCategory, createDbClient, itemCategory, items } from '@era/db';

import { auth } from '../../../lib/auth.ts';
import { serverStorageClient } from '../../../lib/storage-server.ts';

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

  const body: unknown = await request.json().catch(() => null);
  const rawKey = (body as { rawKey?: unknown } | null)?.rawKey;
  if (typeof rawKey !== 'string' || rawKey.length === 0) {
    return NextResponse.json({ error: 'invalid' }, { status: 400 });
  }
  // Same owner binding as getAssetUrl: the key must live under the caller's
  // prefix, so a caller can never process another user's object.
  if (!rawKey.startsWith(`${userId}/`)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  // Fetch the raw bytes via an owner-scoped presigned GET (private bucket). A
  // failure here means there is nothing to process.
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
    console.error('[era-process] failed to fetch raw object:', error);
    return NextResponse.json({ error: 'raw_unavailable' }, { status: 502 });
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
        // items.name is NOT NULL; placeholder until the confirm screen forces the
        // user to set the real name.
        name: classification?.name ?? 'New item',
        brand: classification?.brand ?? null,
        colorPrimary: classification?.colorPrimary ?? null,
        colors: classification?.colors ?? null,
        pattern: classification?.pattern ?? null,
        imageRawPath: rawKey,
        imageCutoutPath: cutoutPath,
        source: 'photo',
        tagsConfirmed: false,
        archived: false,
      })
      .returning();

    return NextResponse.json({
      item: row,
      processed: { bg: cutoutPath !== null, vision: classification !== null },
    });
  } catch (error) {
    console.error('[era-process] failed to persist item:', error);
    return NextResponse.json({ error: 'save_failed' }, { status: 500 });
  }
}
