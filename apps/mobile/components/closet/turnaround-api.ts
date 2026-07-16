/**
 * Turnaround API — the mobile closet's calls into the AI turnaround-views routes.
 *
 *   GET  /api/items/[id]/turnaround  -> TurnaroundState   (404 when flag off / not owner)
 *   POST /api/items/[id]/turnaround  -> TurnaroundState   (kicks a render + QA run)
 *
 * Owner-scoped, so each request carries the signed-in session via Better Auth's
 * `$fetch` (which injects the persisted cookie + baseURL), falling back to a bare
 * fetch with the plugin cookie — the same idiom as `components/items/api.ts`. Uses
 * ABSOLUTE URLs (`${baseURL}${path}`): `$fetch` resolves relative paths against
 * `/api/auth` under Metro and would 404, so every path here is absolute.
 *
 * The POST is SLOW — up to ~60s wall (three generations + Claude-vision QA). It is
 * awaited with a long client timeout; on a network drop (or a `409 already_running`
 * / a stalled request) {@link generateTurnaround} falls back to polling GET every
 * ~4s until the status leaves `running` (capped ~90s). A completed run may carry an
 * EMPTY `renders` array — that is a finished run where QA rejected everything, a
 * calm "didn't pass" beat for the caller, NOT an error.
 *
 * Status mapping on POST: 429 → {@link LimitReachedError} (daily cap, the shared
 * toast idiom); 503 → {@link TurnaroundUnavailableError} (feature off server-side);
 * 400 `category_disabled`/`no_cutout` + 502 `generation_failed` + anything else →
 * {@link TurnaroundFailedError} (calm, retryable).
 */
import type { TurnaroundState } from '@era/core/turnaround';

import { authClient } from '@/lib/auth-client';
import { LimitReachedError, limitFromFetchError, limitFromResponse } from '@/lib/rate-limit';

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

/** The structural slice of the auth client we call, named to stay strict. */
interface AuthFetchClient {
  readonly $fetch?: <T>(
    path: string,
    options: { method: string; body?: unknown },
  ) => Promise<{ data: T | null; error: { message?: string } | null }>;
  readonly getCookie?: () => string;
}

const baseURL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000';

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
 * feature is off / the caller isn't the owner included) so the detail sheet can
 * catch silently and fall back to the static hero.
 */
export async function fetchTurnaround(itemId: string): Promise<TurnaroundState> {
  const client = authClient as unknown as AuthFetchClient;
  const path = turnaroundPath(itemId);

  if (typeof client.$fetch === 'function') {
    const { data, error } = await client.$fetch<TurnaroundState>(`${baseURL}${path}`, {
      method: 'GET',
    });
    if (error) throw new Error(error.message ?? 'turnaround fetch failed');
    if (data === null) throw new Error('turnaround fetch failed');
    return data;
  }

  const cookie = client.getCookie?.() ?? '';
  const response = await fetch(`${baseURL}${path}`, { method: 'GET', headers: { cookie } });
  if (!response.ok) throw new Error(`turnaround fetch failed: ${response.status}`);
  return (await response.json()) as TurnaroundState;
}

/** The classified result of the POST attempt, before it becomes a return or a throw. */
type PostOutcome =
  | { readonly kind: 'ok'; readonly state: TurnaroundState }
  | { readonly kind: 'limit'; readonly error: LimitReachedError }
  | { readonly kind: 'unavailable' }
  | { readonly kind: 'running' }
  | { readonly kind: 'retry' }
  | { readonly kind: 'network' };

/** Map a non-2xx status (429 handled by the caller) to a POST outcome. */
function classifyStatus(status: number): PostOutcome {
  if (status === 503) return { kind: 'unavailable' };
  if (status === 409) return { kind: 'running' }; // already generating → poll
  if (status === 0) return { kind: 'network' }; // transport error with no status → poll
  return { kind: 'retry' }; // 400 category_disabled/no_cutout, 502 generation_failed, other
}

/** Fire the POST and classify it. Only genuine transport failures throw here. */
async function postTurnaround(itemId: string): Promise<PostOutcome> {
  const client = authClient as unknown as AuthFetchClient;
  const path = turnaroundPath(itemId);

  if (typeof client.$fetch === 'function') {
    const { data, error } = await client.$fetch<TurnaroundState>(`${baseURL}${path}`, {
      method: 'POST',
    });
    if (error) {
      const status = (error as Record<string, unknown>).status;
      if (status === 429) {
        return { kind: 'limit', error: limitFromFetchError(error) ?? new LimitReachedError(null) };
      }
      return classifyStatus(typeof status === 'number' ? status : 0);
    }
    if (data === null) return { kind: 'retry' };
    return { kind: 'ok', state: data };
  }

  const cookie = client.getCookie?.() ?? '';
  const response = await fetch(`${baseURL}${path}`, { method: 'POST', headers: { cookie } });
  if (!response.ok) {
    if (response.status === 429) return { kind: 'limit', error: await limitFromResponse(response) };
    return classifyStatus(response.status);
  }
  return { kind: 'ok', state: (await response.json()) as TurnaroundState };
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Reject if `promise` hasn't settled within `ms` — the long-POST wall clock. */
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('turnaround post timeout')), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error instanceof Error ? error : new Error(String(error)));
      },
    );
  });
}

/**
 * Poll GET until the run leaves `running` (or the cap is hit). A transient read
 * failure mid-poll is not terminal — it keeps trying until the cap, then throws
 * {@link TurnaroundFailedError}. Used both as the POST's network fallback and when
 * the detail sheet opens onto an already-`running` item.
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
 * already_running`, or a POST that somehow returns still-`running` all fall back to
 * {@link pollTurnaround}. Throws {@link LimitReachedError} (429),
 * {@link TurnaroundUnavailableError} (503), or {@link TurnaroundFailedError}
 * (retryable) for the terminal failures.
 */
export async function generateTurnaround(itemId: string): Promise<TurnaroundState> {
  let outcome: PostOutcome;
  try {
    outcome = await withTimeout(postTurnaround(itemId), POST_TIMEOUT_MS);
  } catch {
    outcome = { kind: 'network' }; // timeout or transport throw → poll
  }

  switch (outcome.kind) {
    case 'ok':
      return outcome.state.status === 'running' ? pollTurnaround(itemId) : outcome.state;
    case 'limit':
      throw outcome.error;
    case 'unavailable':
      throw new TurnaroundUnavailableError();
    case 'retry':
      throw new TurnaroundFailedError();
    case 'running':
    case 'network':
      return pollTurnaround(itemId);
  }
}
