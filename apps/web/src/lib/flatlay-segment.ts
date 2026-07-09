/**
 * Flat-lay segmentation.
 *
 * A user photographs several clothing items laid out together (a "flat lay");
 * this module asks Claude vision to draw one bounding box per distinct item so a
 * downstream route can crop each box into its own item and run it through
 * `processItemPipeline`. It is the segmentation counterpart to the single-garment
 * vision stage in `item-pipeline.ts` and follows the same contract:
 *
 *   - Dormant until a real `ANTHROPIC_API_KEY` is configured — no key (or an
 *     obvious placeholder) returns null immediately, so the caller can surface an
 *     honest "not available yet" path instead of a failed request.
 *   - A forced tool call (`report_items`) is the structured-output channel; the
 *     model must answer through the tool, never as free text.
 *   - Validation is load-bearing, not decorative: the returned boxes feed a
 *     cropper, so malformed / degenerate boxes are dropped here rather than
 *     shipped downstream.
 *   - Any failure — unsupported media type, timeout, network error, malformed
 *     output — resolves to null. This function NEVER throws; the caller treats
 *     null as "segmentation unavailable" and falls back to manual capture.
 *
 * Coordinates are NORMALIZED to the 0..1 range (fractions of the image width and
 * height), so they are independent of whatever resolution the provider reasoned
 * over. The cropper multiplies by the real pixel dimensions of the source image.
 *
 * Security: the image bytes are sent to Anthropic only; the API key is read from
 * the server environment ONLY, is never logged, and never appears in a returned
 * value. Errors are logged by class name only (never the message, which could
 * echo request content).
 */
import Anthropic from '@anthropic-ai/sdk';

/** Wall-clock budget for the segmentation call, in milliseconds. */
const SEGMENT_TIMEOUT_MS = 15_000;

/** Model used for segmentation — matches the vision stage in `item-pipeline.ts`. */
const SEGMENT_MODEL = 'claude-opus-4-8';

/**
 * Media types Claude vision can read. A flat lay in any other container (e.g. a
 * raw avif) is rejected up front rather than sent on a request that would fail.
 */
const SEGMENT_MEDIA_TYPES = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp']);
type SegmentMediaType = 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp';

/** Boxes narrower/shorter than this fraction of the image are slivers — dropped. */
const MIN_SIDE = 0.02;
/** Boxes at least this wide/tall span ~the whole image — dropped as non-specific. */
const MAX_SIDE = 0.98;
/** Upper bound on boxes returned; extras beyond this are dropped by descending area. */
const MAX_BOXES = 12;
/** Length cap for a model-supplied label (bounds stored/rendered text). */
const LABEL_MAX = 80;
/** Fallback label when the model omits or empties one but the geometry is valid. */
const DEFAULT_LABEL = 'item';

/**
 * One detected item, as a bounding box in normalized image coordinates.
 *
 * `x`/`y` are the top-left corner and `width`/`height` the extent, all as
 * fractions in [0, 1] of the image's width and height respectively. `label` is a
 * short human description of the item (e.g. "black denim jacket").
 */
export interface SegmentBox {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly label: string;
}

/**
 * The Anthropic call this module makes, narrowed to the one method it uses. The
 * real client's `messages.create` satisfies this; tests inject a fake so no
 * network call and no real key are needed. Mirrors the `fetchImpl` injection seam
 * in `send-email.ts`.
 */
export type SegmentMessageCreate = (
  body: Anthropic.MessageCreateParamsNonStreaming,
  options?: { readonly timeout?: number },
) => Promise<Anthropic.Message>;

/**
 * Injectable seams for testing. All default to the real process globals, so
 * production callers pass nothing:
 *   - `env` — the credential source (defaults to `process.env`).
 *   - `createMessage` — the Anthropic `messages.create` call (defaults to a real
 *     client built from the resolved key).
 *   - `log` — the error sink (defaults to `console.error`).
 */
export interface SegmentOptions {
  readonly env?: Record<string, string | undefined>;
  readonly createMessage?: SegmentMessageCreate;
  readonly log?: (message: string) => void;
}

/**
 * True only for a real, operator-supplied key. The committed `.env.example` ships
 * obvious placeholders (`change-me…`, `sk-ant-xxxx…`); treating those as
 * configured would fire a request that can only fail, so we reject them and keep
 * the feature dormant. Mirrors the guard in `item-pipeline.ts`.
 */
function isRealCredential(value: string | undefined): value is string {
  if (!value) {
    return false;
  }
  return !value.startsWith('change-me') && !value.startsWith('sk-ant-xxxx');
}

/** The forced-tool prompt: identify each physical item, exclude non-items. */
const SEGMENT_PROMPT = [
  'This photo shows several clothing, footwear, or accessory items laid out flat.',
  'Report one bounding box per DISTINCT physical item using the report_items tool.',
  '- Give exactly one box per item; do not split a single item into parts.',
  '- Coordinates x, y, w, h are fractions of the image in the 0..1 range: x,y are the',
  "  box's top-left corner; w,h are its width and height.",
  '- label: a short description of the item, e.g. "black denim jacket".',
  '- Exclude the background, surface, hangers, packaging, and any people or body parts.',
  '- Boxes may overlap slightly where items touch.',
].join('\n');

/** Input schema for the forced `report_items` tool: an array of 0..1 boxes. */
const REPORT_ITEMS_TOOL: Anthropic.Tool = {
  name: 'report_items',
  description: 'Record one bounding box per distinct clothing, footwear, or accessory item in the flat-lay photo.',
  input_schema: {
    type: 'object',
    properties: {
      items: {
        type: 'array',
        description: 'One entry per distinct item.',
        items: {
          type: 'object',
          properties: {
            x: { type: 'number', description: 'Left edge as a fraction of image width (0..1).' },
            y: { type: 'number', description: 'Top edge as a fraction of image height (0..1).' },
            w: { type: 'number', description: 'Width as a fraction of image width (0..1).' },
            h: { type: 'number', description: 'Height as a fraction of image height (0..1).' },
            label: { type: 'string', description: 'Short item description, e.g. "black denim jacket".' },
          },
          required: ['x', 'y', 'w', 'h', 'label'],
        },
      },
    },
    required: ['items'],
  } as Anthropic.Tool.InputSchema,
};

/** Clamp a value to [0, 1]; non-finite input yields null so the box is dropped. */
function clampUnit(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return null;
  }
  if (value < 0) {
    return 0;
  }
  if (value > 1) {
    return 1;
  }
  return value;
}

/** Coerce a label to a bounded non-empty string, else the default placeholder. */
function coerceLabel(value: unknown): string {
  if (typeof value !== 'string') {
    return DEFAULT_LABEL;
  }
  const trimmed = value.trim().slice(0, LABEL_MAX);
  return trimmed.length > 0 ? trimmed : DEFAULT_LABEL;
}

/**
 * Validate one raw tool entry into a `SegmentBox`, or null when unusable.
 *
 * Rules (all load-bearing — the output feeds a cropper):
 *   - x, y, w, h must be finite numbers; each is clamped to [0, 1].
 *   - a side ≤ MIN_SIDE is a sliver, and a side ≥ MAX_SIDE spans ~the whole
 *     image — either rejects the box (both are useless to crop).
 *   - the label is bounded and, if missing/empty, replaced with a placeholder.
 */
function coerceBox(input: unknown): SegmentBox | null {
  if (typeof input !== 'object' || input === null) {
    return null;
  }
  const raw = input as Record<string, unknown>;
  const x = clampUnit(raw.x);
  const y = clampUnit(raw.y);
  const width = clampUnit(raw.w);
  const height = clampUnit(raw.h);
  if (x === null || y === null || width === null || height === null) {
    return null;
  }
  if (width <= MIN_SIDE || height <= MIN_SIDE || width >= MAX_SIDE || height >= MAX_SIDE) {
    return null;
  }
  return { x, y, width, height, label: coerceLabel(raw.label) };
}

/**
 * Turn the raw `report_items` tool input into validated boxes.
 *
 * Drops malformed / degenerate entries, and if more than `MAX_BOXES` survive
 * keeps the largest by area (the most likely to be real items, and the safest to
 * crop). Returns null when nothing survives so the caller gets one honest signal.
 */
function coerceBoxes(input: unknown): SegmentBox[] | null {
  if (typeof input !== 'object' || input === null) {
    return null;
  }
  const items = (input as Record<string, unknown>).items;
  if (!Array.isArray(items)) {
    return null;
  }
  const boxes = items.map(coerceBox).filter((box): box is SegmentBox => box !== null);
  if (boxes.length === 0) {
    return null;
  }
  if (boxes.length <= MAX_BOXES) {
    return boxes;
  }
  return [...boxes].sort((a, b) => b.width * b.height - a.width * a.height).slice(0, MAX_BOXES);
}

/** Build the real Anthropic `messages.create` seam for a resolved key. */
function defaultCreateMessage(apiKey: string): SegmentMessageCreate {
  const client = new Anthropic({ apiKey, maxRetries: 1 });
  return (body, options) => client.messages.create(body, options);
}

/**
 * Segment a flat-lay photo into per-item bounding boxes via Claude vision.
 *
 * @param imageBytes - the raw image bytes of the flat-lay photo.
 * @param mediaType - the image's media type; anything outside
 *   {@link SEGMENT_MEDIA_TYPES} returns null without a request.
 * @param opts - injectable seams (env, Anthropic call, log sink); production
 *   callers omit this.
 * @returns the detected boxes in normalized 0..1 coordinates, or null when the
 *   feature is dormant, the media type is unsupported, the call fails/times out,
 *   or no valid box survives validation. Never throws.
 */
export async function segmentFlatLay(
  imageBytes: Uint8Array | Buffer,
  mediaType: string,
  opts: SegmentOptions = {},
): Promise<SegmentBox[] | null> {
  const env = opts.env ?? process.env;
  const apiKey = env.ANTHROPIC_API_KEY;
  if (!isRealCredential(apiKey) || !SEGMENT_MEDIA_TYPES.has(mediaType)) {
    return null;
  }

  const log = opts.log ?? console.error;
  const createMessage = opts.createMessage ?? defaultCreateMessage(apiKey);
  try {
    const response = await createMessage(
      {
        model: SEGMENT_MODEL,
        max_tokens: 1024,
        tools: [REPORT_ITEMS_TOOL],
        tool_choice: { type: 'tool', name: REPORT_ITEMS_TOOL.name },
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image',
                source: { type: 'base64', media_type: mediaType as SegmentMediaType, data: Buffer.from(imageBytes).toString('base64') },
              },
              { type: 'text', text: SEGMENT_PROMPT },
            ],
          },
        ],
      },
      { timeout: SEGMENT_TIMEOUT_MS },
    );
    const toolUse = response.content.find((block) => block.type === 'tool_use');
    return toolUse ? coerceBoxes(toolUse.input) : null;
  } catch (error) {
    // Class only — never the message, which could echo request content or key.
    log(`[era-flatlay] segmentation failed: ${error instanceof Error ? error.constructor.name : 'unknown error'}`);
    return null;
  }
}
