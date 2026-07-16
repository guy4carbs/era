/**
 * Turnaround API — the web closet's calls into the AI turnaround-views routes.
 *
 *   GET  /api/items/[id]/turnaround  -> TurnaroundState   (404 when flag off / not owner)
 *   POST /api/items/[id]/turnaround  -> TurnaroundState   (kicks a render + QA run)
 *
 * Owner-scoped and same-origin: every call is a plain relative `fetch`, so the
 * browser attaches the session cookie automatically and the POST's `Origin`
 * matches `host` (the route's same-origin guard). No body on either verb — the
 * item id is in the path. The same idiom the rest of the closet uses.
 *
 * The POST is SLOW — up to ~60s wall (three generations + Claude-vision QA). It is
 * awaited under a long client timeout; on a network drop (or a `409
 * already_running`, or a stalled request) {@link generateTurnaround} falls back
 * to polling GET every ~4s until the status leaves `running` (capped ~90s). A
 * completed run may carry an EMPTY `renders` array — a finished run where QA
 * rejected everything, a calm "didn't pass" beat, NOT an error.
 *
 * Status mapping on POST: 429 → {@link TurnaroundLimitError} (daily cap, the
 * shared daily-limit toast idiom); 503 → {@link TurnaroundUnavailableError}
 * (feature off server-side); 400 `category_disabled`/`no_cutout` + 502
 * `generation_failed` + anything else → {@link TurnaroundFailedError} (calm,
 * retryable).
 */
import type { TurnaroundState } from '@era/core/turnaround';

/** The per-user daily generation cap was reached (HTTP 429) — a calm pause, not an error. */
export class TurnaroundLimitError extends Error {
  readonly status = 429;

  constructor() {
    super('turnaround daily limit reached');
    this.name = 'TurnaroundLimitError';
  }
}

/** The feature is off server-side (HTTP 503) — a dormant beat, not an error. */
export class TurnaroundUnavailableError extends Error {
  readonly status = 503;

  constructor() {
    super('turnaround unavailable');
    this.name = 'TurnaroundUnavailableError';
  }
}

/**
 * A turnaround run couldn't be produced — a category/cutout rejection, a
 * generation failure, or a poll that never settled. Retryable: the caller offers
 * another go rather than surfacing a cold error.
 */
export class TurnaroundFailedError extends Error {
  constructor() {
    super('turnaround failed');
    this.name = 'TurnaroundFailedError';
  }
}

/** Long client timeout for the POST — the server does 3 generations + QA (~60s wall). */
const POST_TIMEOUT_MS = 75_000;
/** Poll cadence once we fall back to GET after a slow/dropped POST. */
const POLL_INTERVAL_MS = 4_000;
/** Give up polling after this — then surface the calm retryable miss. */
const POLL_CAP_MS = 90_000;

function turnaroundPath(itemId: string): string {
  return `/api/items/${itemId}/turnaround`;
}

/**
 * Read an item's turnaround state. Throws on any non-success (a 404 when the
 * feature is off / the caller isn't the owner included) so the detail surface can
 * catch silently and fall back to the static cutout.
 */
export async function fetchTurnaround(itemId: string): Promise<TurnaroundState> {
  const response = await fetch(turnaroundPath(itemId), { method: 'GET' });
  if (!response.ok) throw new Error(`turnaround fetch failed: ${response.status}`);
  return (await response.json()) as TurnaroundState;
}

/** The classified result of the POST attempt, before it becomes a return or a throw. */
type PostOutcome =
  | { readonly kind: 'ok'; readonly state: TurnaroundState }
  | { readonly kind: 'limit' }
  | { readonly kind: 'unavailable' }
  | { readonly kind: 'running' }
  | { readonly kind: 'retry' }
  | { readonly kind: 'network' };

/** Map a non-2xx status to a POST outcome. */
function classifyStatus(status: number): PostOutcome {
  if (status === 429) return { kind: 'limit' };
  if (status === 503) return { kind: 'unavailable' };
  if (status === 409) return { kind: 'running' }; // already generating → poll
  return { kind: 'retry' }; // 400 category_disabled/no_cutout, 502 generation_failed, other
}

/** Fire the POST and classify it. Only genuine transport failures resolve to `network`. */
async function postTurnaround(itemId: string): Promise<PostOutcome> {
  let response: Response;
  try {
    response = await fetch(turnaroundPath(itemId), {
      method: 'POST',
      signal: AbortSignal.timeout(POST_TIMEOUT_MS),
    });
  } catch {
    return { kind: 'network' }; // timeout or transport error with no status → poll
  }
  if (!response.ok) return classifyStatus(response.status);
  return { kind: 'ok', state: (await response.json()) as TurnaroundState };
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Poll GET until the run leaves `running` (or the cap is hit). A transient read
 * failure mid-poll is not terminal — it keeps trying until the cap, then throws
 * {@link TurnaroundFailedError}. Used both as the POST's network fallback and when
 * the detail surface opens onto an already-`running` item.
 */
export async function pollTurnaround(
  itemId: string,
  options: { readonly intervalMs?: number; readonly capMs?: number } = {},
): Promise<TurnaroundState> {
  const intervalMs = options.intervalMs ?? POLL_INTERVAL_MS;
  const deadline = Date.now() + (options.capMs ?? POLL_CAP_MS);

  for (;;) {
    let state: TurnaroundState | null = null;
    try {
      state = await fetchTurnaround(itemId);
    } catch {
      // Transient read failure during polling — not terminal; retry until the cap.
    }
    if (state && state.status !== 'running') return state;
    if (Date.now() >= deadline) throw new TurnaroundFailedError();
    await delay(intervalMs);
  }
}

/**
 * Kick a turnaround run and resolve to the finished {@link TurnaroundState}. Awaits
 * the slow POST under a long timeout; a timeout, a network drop, a `409
 * already_running`, or a POST that somehow returns still-`running` all fall back
 * to {@link pollTurnaround}. Throws {@link TurnaroundLimitError} (429),
 * {@link TurnaroundUnavailableError} (503), or {@link TurnaroundFailedError}
 * (retryable) for the terminal failures.
 */
export async function generateTurnaround(itemId: string): Promise<TurnaroundState> {
  const outcome = await postTurnaround(itemId);

  switch (outcome.kind) {
    case 'ok':
      return outcome.state.status === 'running' ? pollTurnaround(itemId) : outcome.state;
    case 'limit':
      throw new TurnaroundLimitError();
    case 'unavailable':
      throw new TurnaroundUnavailableError();
    case 'retry':
      throw new TurnaroundFailedError();
    case 'running':
    case 'network':
      return pollTurnaround(itemId);
  }
}
