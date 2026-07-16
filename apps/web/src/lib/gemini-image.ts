/**
 * Gemini image generation — the single stage that mints a candidate turnaround
 * render for one angle from an item's cutout PNG.
 *
 * This is the image half of the AI turnaround feature (the QA half is Claude
 * vision, in turnaround-server.ts). It talks to Google's Generative Language REST
 * API directly (no SDK dependency) and returns raw PNG bytes for the QA gate to
 * judge — it NEVER persists anything and NEVER decides acceptance.
 *
 * Same never-throw posture as the item-pipeline enrichment stages: dormant without
 * a real GEMINI_API_KEY, and ANY failure (timeout, non-200, malformed body, no
 * image part) resolves to `null` with a `[era-turnaround]` console.error rather
 * than throwing. The caller treats null as "this angle produced nothing".
 */

/** The Gemini image model endpoint (v1beta generateContent). */
const GEMINI_ENDPOINT =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent';

/** Wall budget for one image generation. Generous — image synthesis is slow. */
const GEMINI_TIMEOUT_MS = 30_000;

/**
 * True only for a real, operator-supplied key. The committed .env.example ships
 * an obvious `change-me…` placeholder; treating it as configured would fire a
 * request that can only fail, so we reject it and keep the stage dormant. Mirrors
 * the guard in item-pipeline / derive-style-profile (Gemini keys carry no
 * `sk-ant-` shape, so the placeholder prefix is the only tell here).
 */
function isRealCredential(value: string | undefined): value is string {
  if (!value) {
    return false;
  }
  return !value.startsWith('change-me');
}

/**
 * Is Gemini image generation configured? A route reads this to 503 the turnaround
 * POST when the feature is flagged on but the key is absent — a dormant feature
 * must never block boot, so GEMINI_API_KEY is deliberately NOT in the zod env
 * schema (plus-server precedent).
 */
export function isGeminiConfigured(): boolean {
  return isRealCredential(process.env.GEMINI_API_KEY);
}

/** Pull the first inline image part out of a generateContent response, camelCase or snake_case. */
function extractImageBytes(json: unknown): Uint8Array | null {
  const parts = (json as { candidates?: { content?: { parts?: unknown[] } }[] } | null)?.candidates?.[0]?.content
    ?.parts;
  if (!Array.isArray(parts)) {
    return null;
  }
  for (const part of parts) {
    // The API returns camelCase `inlineData`; accept snake_case `inline_data` too
    // so a response-shape tweak on their side doesn't silently drop every image.
    const inline = (part as { inlineData?: { data?: unknown }; inline_data?: { data?: unknown } } | null)?.inlineData
      ?? (part as { inline_data?: { data?: unknown } } | null)?.inline_data;
    const data = inline?.data;
    if (typeof data === 'string' && data.length > 0) {
      return new Uint8Array(Buffer.from(data, 'base64'));
    }
  }
  return null;
}

/**
 * Generate one angle's render from the cutout PNG and prompt. Returns the raw PNG
 * bytes, or `null` on any failure (dormant, timeout, non-200, missing image).
 * Never throws — the caller decides what a null angle means for the whole job.
 */
export async function generateAngleRender(cutoutPng: Uint8Array, prompt: string): Promise<Uint8Array | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!isRealCredential(apiKey)) {
    return null;
  }
  try {
    const response = await fetch(GEMINI_ENDPOINT, {
      method: 'POST',
      headers: {
        'x-goog-api-key': apiKey,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { inline_data: { mime_type: 'image/png', data: Buffer.from(cutoutPng).toString('base64') } },
              { text: prompt },
            ],
          },
        ],
        generationConfig: { responseModalities: ['IMAGE'] },
      }),
      signal: AbortSignal.timeout(GEMINI_TIMEOUT_MS),
    });
    if (!response.ok) {
      console.error('[era-turnaround] gemini image generation returned', response.status);
      return null;
    }
    const json: unknown = await response.json();
    const bytes = extractImageBytes(json);
    if (bytes === null) {
      console.error('[era-turnaround] gemini response contained no inline image part');
      return null;
    }
    return bytes;
  } catch (error) {
    console.error('[era-turnaround] gemini image generation failed:', error);
    return null;
  }
}
