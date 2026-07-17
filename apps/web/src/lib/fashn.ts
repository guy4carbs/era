/**
 * FASHN.ai REST client — the avatar / virtual-try-on vendor seam.
 *
 * FASHN is Era's try-on provider (dedicated fashion API). It exposes ONE universal
 * async endpoint: `POST /v1/run` submits a job and returns a prediction `id`, then
 * `GET /v1/status/{id}` is polled until the prediction reaches a terminal state
 * (`completed` → an `output` array of image URLs, or `failed`). Two job shapes
 * matter here: `model-create` builds the avatar likeness from the user's photos,
 * and `tryon-v1.6` renders one garment onto a person image (outfits chain these —
 * the output of call N becomes the person input of call N+1).
 *
 * DEFENSIVE POSTURE — this whole feature ships dark (build now, verify later), so
 * every function here is written to never throw and to treat ANY unexpected vendor
 * response shape as a null result with a `[era-tryon]` console.error, exactly like
 * the turnaround Gemini stage. A dormant deployment (no real `FASHN_API_KEY`) short-
 * circuits before any network call. `FASHN_API_KEY` is deliberately NOT in the zod
 * env schema (plus-server / turnaround precedent) so a dormant feature never blocks
 * boot.
 *
 * Never import from a client bundle — it holds the vendor credential.
 */

/** The FASHN universal API base. `/run` submits a job; `/status/{id}` polls it. */
const FASHN_API_BASE = 'https://api.fashn.ai/v1';

/** Per-HTTP-request budget for a single `/run` submit or `/status` poll. */
const REQUEST_TIMEOUT_MS = 10_000;
/** Budget for downloading one finished image from the FASHN CDN. */
const IMAGE_FETCH_TIMEOUT_MS = 10_000;
/** Gap between status polls while a prediction is in flight. */
const POLL_INTERVAL_MS = 1_500;
/** Wall budget for a single try-on call (submit + polling + no download). */
const TRYON_BUDGET_MS = 45_000;
/** Wall budget for avatar model creation — slower (identity lock adds ~20s). */
const MODEL_CREATE_BUDGET_MS = 90_000;

/** The try-on model id + its `ai_usage.model` label (mirrored in tryon-server). */
export const FASHN_TRYON_MODEL = 'tryon-v1.6';
/** The model-creation job id + its `ai_usage.model` label (mirrored in avatar-server). */
export const FASHN_MODEL_CREATE_MODEL = 'model-create';

/**
 * True only for a real, operator-supplied key. The committed `.env.example` ships
 * a `change-me…` placeholder; treating it as configured would fire a request that
 * can only fail, so a placeholder keeps the feature dormant. Mirrors the guard in
 * gemini-image / plus-stripe — FASHN keys carry no `sk-ant-` shape, so the
 * placeholder prefix is the only tell.
 */
function isRealCredential(value: string | undefined): value is string {
  if (!value) {
    return false;
  }
  return !value.startsWith('change-me');
}

/**
 * Is FASHN configured? A route reads this to 503 the avatar/try-on POST when the
 * feature is flagged on but the key is absent — a dormant feature must never block
 * boot, so `FASHN_API_KEY` is deliberately NOT in the zod env schema.
 */
export function isFashnConfigured(): boolean {
  return isRealCredential(process.env.FASHN_API_KEY);
}

/** The result of building an avatar: the base image bytes + the vendor seam id. */
export interface FashnModelResult {
  /** The generated avatar likeness PNG — the ONLY image the try-on pipeline consumes. */
  readonly modelImageBytes: Uint8Array;
  /**
   * The FASHN prediction id for the creation job — recorded as `vendor_model_id`
   * so {@link deleteFashnModel} has a handle if the DPA ever confirms a vendor-side
   * deletion endpoint. Null when the id could not be read from the response.
   */
  readonly vendorModelId: string | null;
}

/** A terminal-state FASHN prediction: `output` URLs on success, or null on failure/timeout. */
interface PredictionResult {
  readonly id: string | null;
  readonly outputUrls: string[] | null;
}

/** The `Authorization: Bearer …` + JSON headers for every FASHN call. */
function fashnHeaders(apiKey: string): Record<string, string> {
  return {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
  };
}

/**
 * Submit a `/v1/run` job and return its prediction id, or null on any failure.
 * Never throws — a null id aborts the caller cleanly.
 */
async function submitRun(apiKey: string, body: unknown): Promise<string | null> {
  try {
    const response = await fetch(`${FASHN_API_BASE}/run`, {
      method: 'POST',
      headers: fashnHeaders(apiKey),
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!response.ok) {
      console.error(`[era-tryon] FASHN /run returned ${response.status}`);
      return null;
    }
    const json: unknown = await response.json();
    const id = (json as { id?: unknown } | null)?.id;
    if (typeof id !== 'string' || id.length === 0) {
      console.error('[era-tryon] FASHN /run response missing a prediction id');
      return null;
    }
    return id;
  } catch (error) {
    console.error('[era-tryon] FASHN /run submit failed:', error);
    return null;
  }
}

/** A tiny cancelable delay for the poll loop. */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Poll `/v1/status/{id}` until the prediction is `completed` (→ its `output` URL
 * array), `failed` (→ null), or the wall budget elapses (→ null). Any malformed
 * status body is treated as a transient miss and retried until the budget runs
 * out. Never throws.
 */
async function pollUntilTerminal(
  apiKey: string,
  id: string,
  startedAt: number,
  budgetMs: number,
): Promise<string[] | null> {
  while (Date.now() - startedAt < budgetMs) {
    try {
      const response = await fetch(`${FASHN_API_BASE}/status/${id}`, {
        method: 'GET',
        headers: fashnHeaders(apiKey),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      if (response.ok) {
        const json: unknown = await response.json();
        const status = (json as { status?: unknown } | null)?.status;
        if (status === 'completed') {
          const output = (json as { output?: unknown } | null)?.output;
          const urls = Array.isArray(output) ? output.filter((u): u is string => typeof u === 'string' && u.length > 0) : [];
          if (urls.length === 0) {
            console.error('[era-tryon] FASHN prediction completed with no output URLs');
            return null;
          }
          return urls;
        }
        if (status === 'failed') {
          const vendorError = (json as { error?: unknown } | null)?.error;
          console.error('[era-tryon] FASHN prediction failed:', vendorError ?? 'unknown');
          return null;
        }
        // starting | in_queue | processing | anything unexpected → keep waiting.
      } else {
        console.error(`[era-tryon] FASHN /status returned ${response.status}`);
      }
    } catch (error) {
      console.error('[era-tryon] FASHN /status poll error; retrying within budget:', error);
    }
    await delay(POLL_INTERVAL_MS);
  }
  console.error(`[era-tryon] FASHN prediction ${id} did not finish within ${budgetMs}ms`);
  return null;
}

/** Submit a run then poll it to a terminal state within `budgetMs`. Never throws. */
async function runPrediction(apiKey: string, body: unknown, budgetMs: number): Promise<PredictionResult> {
  const startedAt = Date.now();
  const id = await submitRun(apiKey, body);
  if (!id) {
    return { id: null, outputUrls: null };
  }
  const outputUrls = await pollUntilTerminal(apiKey, id, startedAt, budgetMs);
  return { id, outputUrls };
}

/** Download a finished image from a FASHN CDN URL to raw bytes, or null on failure. Never throws. */
async function fetchImageBytes(url: string): Promise<Uint8Array | null> {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(IMAGE_FETCH_TIMEOUT_MS) });
    if (!response.ok) {
      console.error(`[era-tryon] FASHN image download returned ${response.status}`);
      return null;
    }
    return new Uint8Array(await response.arrayBuffer());
  } catch (error) {
    console.error('[era-tryon] FASHN image download failed:', error);
    return null;
  }
}

/**
 * The prompt that shapes the avatar likeness: a neutral, full-body fashion model
 * on a plain studio background, framed so garments render cleanly. The user's own
 * face is locked in via `face_reference`; the prompt only sets pose/scene so the
 * result is a consistent, dressable base image.
 */
const MODEL_CREATE_PROMPT =
  'A full-body photograph of a person standing straight in a neutral relaxed pose, ' +
  'facing forward, arms at their sides, against a plain light-grey studio background, ' +
  'wearing simple fitted neutral base clothing, even soft lighting, sharp focus, ' +
  'suitable as a base image for virtual garment try-on.';

/**
 * Build an avatar likeness from 1–3 of the user's own photos via FASHN Model
 * Creation. The first photo locks identity (`face_reference`); a second, if given,
 * guides pose/composition (`image_reference`). Returns the generated base image
 * bytes plus the prediction id (the deletion seam), or null on ANY failure —
 * dormant key, submit error, non-terminal within budget, empty output, or a failed
 * image download. Never throws.
 */
export async function createFashnModel(photoUrls: string[]): Promise<FashnModelResult | null> {
  const apiKey = process.env.FASHN_API_KEY;
  if (!isRealCredential(apiKey)) {
    return null;
  }
  const [faceReference, imageReference] = photoUrls;
  if (!faceReference) {
    console.error('[era-tryon] createFashnModel called with no source photos');
    return null;
  }

  const inputs: Record<string, unknown> = {
    prompt: MODEL_CREATE_PROMPT,
    face_reference: faceReference,
    output_format: 'png',
  };
  if (imageReference) {
    inputs.image_reference = imageReference;
  }

  const { id, outputUrls } = await runPrediction(apiKey, { model_name: FASHN_MODEL_CREATE_MODEL, inputs }, MODEL_CREATE_BUDGET_MS);
  if (!outputUrls) {
    return null;
  }
  const [firstUrl] = outputUrls;
  const modelImageBytes = firstUrl ? await fetchImageBytes(firstUrl) : null;
  if (!modelImageBytes) {
    return null;
  }
  return { modelImageBytes, vendorModelId: id };
}

/**
 * Map an Era try-on category slug onto FASHN's `tryon-v1.6` category enum
 * (`auto | tops | bottoms | one-pieces`). Tops and outerwear are both upper-body
 * garments (`tops`); a dress is a `one-pieces`; a bottom is `bottoms`; anything
 * else (notably shoes, which FASHN has no dedicated category for) defers to `auto`
 * so the vendor classifies it rather than us forcing a wrong slot.
 */
function fashnCategory(category: string): 'auto' | 'tops' | 'bottoms' | 'one-pieces' {
  switch (category) {
    case 'top':
    case 'outerwear':
      return 'tops';
    case 'bottom':
      return 'bottoms';
    case 'dress':
      return 'one-pieces';
    default:
      return 'auto';
  }
}

/**
 * Render ONE garment onto a person image via FASHN Try-On v1.6. `personUrl` and
 * `garmentUrl` are each a URL or a `data:` base64 string (the chain feeds the
 * previous step's output forward as the next person input). Returns the rendered
 * PNG bytes, or null on ANY failure (dormant key, submit error, non-terminal
 * within the 45s budget, empty output, or a failed download). Never throws — the
 * caller decides what a null step means for the whole chain (skip-and-continue).
 */
export async function runTryon(personUrl: string, garmentUrl: string, category: string): Promise<Uint8Array | null> {
  const apiKey = process.env.FASHN_API_KEY;
  if (!isRealCredential(apiKey)) {
    return null;
  }

  const { outputUrls } = await runPrediction(
    apiKey,
    {
      model_name: FASHN_TRYON_MODEL,
      inputs: {
        model_image: personUrl,
        garment_image: garmentUrl,
        category: fashnCategory(category),
        mode: 'balanced',
        output_format: 'png',
        num_samples: 1,
      },
    },
    TRYON_BUDGET_MS,
  );
  const [firstUrl] = outputUrls ?? [];
  if (!firstUrl) {
    return null;
  }
  return fetchImageBytes(firstUrl);
}

/**
 * The vendor-side deletion seam. FASHN Model Creation returns generated images, not
 * a persistent server-side model handle, and no public deletion endpoint is
 * documented — so today this is a documented no-op: it records intent and returns.
 * It stays call-site-stable so that if the operator's DPA later confirms a real
 * deletion endpoint (HARD LAUNCH GATE item), the vendor call drops in here without
 * touching any caller. `vendorModelId` is the id recorded at creation time.
 */
export async function deleteFashnModel(vendorModelId: string | null): Promise<void> {
  // No documented vendor-side deletion endpoint exists yet. Avatar erasure is
  // enforced entirely on our side (R2 objects + DB rows swept and verified);
  // vendor retention is governed by the DPA the operator must secure before
  // real-user flag-on. When that DPA confirms a deletion endpoint, wire it here.
  console.error(
    `[era-tryon] vendor-side deletion not available; relying on vendor retention terms (model ${vendorModelId ?? 'none'})`,
  );
}
