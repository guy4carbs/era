/**
 * Avatar / try-on API — the mobile calls into the avatar + virtual try-on routes.
 *
 *   POST   /api/avatar/upload-url  { ext, contentType } -> { url, key }
 *   POST   /api/avatar             { photoKeys[1..3] }   -> AvatarState   (SLOW: model creation)
 *   GET    /api/avatar                                   -> AvatarState
 *   DELETE /api/avatar                                   -> { deleted, storageObjectsDeleted, remaining }
 *   POST   /api/outfits/[id]/tryon                       -> TryonState    (SLOW: garment chain)
 *   GET    /api/outfits/[id]/tryon                       -> TryonState    (poll/resume path)
 *
 * Owner-scoped, so each request carries the signed-in session via Better Auth's
 * `$fetch` (which injects the persisted cookie + baseURL), falling back to a bare
 * fetch with the plugin cookie — the same idiom as `components/closet/turnaround-api.ts`
 * and `components/items/api.ts`. Uses ABSOLUTE URLs (`${baseURL}${path}`): `$fetch`
 * resolves relative paths against `/api/auth` under Metro and would 404. The
 * presigned R2 PUT is the ONE exception — it goes DIRECT to R2 with a plain fetch
 * and no auth header (the URL's signature is the credential); it reuses
 * `uploadToR2` from the closet api.
 *
 * TWO calls are SLOW and awaited under a long client timeout with a GET-poll
 * fallback (the server does the work in-request; the GET is the resume path):
 *   - {@link createAvatar} — FASHN Model Creation (~30–90s). On a timeout / drop /
 *     `409 creating` it polls {@link fetchAvatar} every 5s (cap 180s) until the
 *     status leaves `creating`.
 *   - {@link generateTryon} — the sequential garment chain (up to ~150s). On a
 *     timeout / drop / `409 already_running` it polls {@link fetchTryon} every 5s
 *     (cap 180s) until the status leaves `running`.
 *
 * Non-2xx statuses map to typed, catchable errors so the UI can branch: a 403
 * `plus_required` routes to the paywall, a 409 `no_avatar` routes to onboarding, a
 * 429 carries the render cap's `used`/`limit`, a 503 is the dormant "coming soon"
 * beat, and anything else is a calm retryable failure — never a cold crash.
 */
import type { AvatarState, TryonState } from '@era/core/tryon';

import { authClient } from '@/lib/auth-client';

import { uploadToR2 } from '@/components/items/api';

// --- typed error classes ----------------------------------------------------

/** The user isn't Era+ (HTTP 403 `plus_required`) — route to the paywall (honest upsell). */
export class PlusRequiredError extends Error {
  readonly status = 403;

  constructor() {
    super('plus required');
    this.name = 'PlusRequiredError';
  }
}

/** A try-on was asked for with no avatar yet (HTTP 409 `no_avatar`) — route to onboarding. */
export class NoAvatarError extends Error {
  readonly status = 409;

  constructor() {
    super('no avatar');
    this.name = 'NoAvatarError';
  }
}

/** The outfit holds nothing renderable (HTTP 400 `no_garments`) — a terminal calm beat, no retry. */
export class NoGarmentsError extends Error {
  readonly status = 400;

  constructor() {
    super('no garments');
    this.name = 'NoGarmentsError';
  }
}

/** The monthly render cap is reached (HTTP 429) — carries the count for the calm pause line. */
export class MonthlyLimitError extends Error {
  readonly status = 429;
  readonly used: number | null;
  readonly limit: number | null;

  constructor(used: number | null, limit: number | null) {
    super('monthly limit reached');
    this.name = 'MonthlyLimitError';
    this.used = used;
    this.limit = limit;
  }
}

/** The feature is off server-side (HTTP 503) — a dormant "coming soon" beat, not an error. */
export class TryonUnavailableError extends Error {
  readonly status = 503;

  constructor() {
    super('try-on unavailable');
    this.name = 'TryonUnavailableError';
  }
}

/**
 * A generic, retryable try-on/avatar failure — a 502 generation/creation failure,
 * a poll that never settled, or any other non-success. The caller offers another
 * go rather than surfacing a cold error.
 */
export class TryonFailedError extends Error {
  constructor() {
    super('try-on failed');
    this.name = 'TryonFailedError';
  }
}

// --- shared fetch plumbing ---------------------------------------------------

/** The structural slice of the auth client we call, named to stay strict. */
interface AuthFetchClient {
  readonly $fetch?: <T>(
    path: string,
    options: { method: string; body?: unknown },
  ) => Promise<{ data: T | null; error: (Record<string, unknown> & { message?: string }) | null }>;
  readonly getCookie?: () => string;
}

const baseURL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000';

/** Long client timeout for the avatar create — FASHN Model Creation runs ~30–90s. */
const CREATE_TIMEOUT_MS = 120_000;
/** Long client timeout for the try-on POST — the sequential garment chain runs up to ~150s. */
const TRYON_TIMEOUT_MS = 170_000;
/** Poll cadence once we fall back to GET after a slow/dropped long POST. */
const POLL_INTERVAL_MS = 5_000;
/** Give up polling after this — then surface the calm retryable miss. */
const POLL_CAP_MS = 180_000;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Reject if `promise` hasn't settled within `ms` — the long-POST wall clock. */
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), ms);
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

/** Pull an integer field off a parsed error/JSON record (429 body's used/limit). */
function numberField(source: unknown, key: string): number | null {
  if (typeof source !== 'object' || source === null) return null;
  const value = (source as Record<string, unknown>)[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/** The classified outcome of {@link request}: the parsed body, or a status + raw body. */
type RequestResult<T> = { ok: true; data: T } | { ok: false; status: number; body: unknown };

/**
 * A minimal authed request that returns either the parsed body or the raw status
 * for the caller to classify. Prefers `$fetch` (attaches the session); falls back
 * to a bare fetch with the plugin cookie. A transport failure with no status
 * surfaces as `status: 0` so the caller can treat it as a poll trigger, never a
 * crash.
 */
async function request<T>(
  path: string,
  options: { method: string; body?: unknown },
): Promise<RequestResult<T>> {
  const client = authClient as unknown as AuthFetchClient;

  if (typeof client.$fetch === 'function') {
    try {
      const { data, error } = await client.$fetch<T>(`${baseURL}${path}`, options);
      if (error) {
        const status = typeof error.status === 'number' ? error.status : 0;
        return { ok: false, status, body: error };
      }
      if (data === null) return { ok: false, status: 0, body: null };
      return { ok: true, data };
    } catch {
      return { ok: false, status: 0, body: null };
    }
  }

  const cookie = client.getCookie?.() ?? '';
  const headers: Record<string, string> = { cookie };
  if (options.body !== undefined) headers['content-type'] = 'application/json';
  try {
    const response = await fetch(`${baseURL}${path}`, {
      method: options.method,
      headers,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    });
    if (!response.ok) {
      const body = await response.json().catch(() => null);
      return { ok: false, status: response.status, body };
    }
    return { ok: true, data: (await response.json()) as T };
  } catch {
    return { ok: false, status: 0, body: null };
  }
}

// --- avatar reads / writes ---------------------------------------------------

/** A presigned PUT target for one avatar source photo. */
export interface AvatarUploadTarget {
  readonly url: string;
  readonly key: string;
}

/**
 * Read the user's avatar state. Throws {@link TryonUnavailableError} when the
 * surface is off (404) and {@link TryonFailedError} on any other non-success, so a
 * calm caller (the settings section, the onboarding poll) can soft-fail. A 200
 * with `{ status: 'none' }` is a normal answer, not an error.
 */
export async function fetchAvatar(): Promise<AvatarState> {
  const result = await request<AvatarState>('/api/avatar', { method: 'GET' });
  if (result.ok) return result.data;
  if (result.status === 404) throw new TryonUnavailableError();
  throw new TryonFailedError();
}

/**
 * Ask the server for a short-lived presigned PUT to the private avatars bucket for
 * one source photo. 403 → {@link PlusRequiredError} (route to paywall); 404 →
 * {@link TryonUnavailableError} (flag off); anything else → {@link TryonFailedError}.
 */
export async function requestAvatarUploadUrl(
  ext: string,
  contentType: string,
): Promise<AvatarUploadTarget> {
  const result = await request<AvatarUploadTarget>('/api/avatar/upload-url', {
    method: 'POST',
    body: { ext, contentType },
  });
  if (result.ok) return result.data;
  if (result.status === 403) throw new PlusRequiredError();
  if (result.status === 404) throw new TryonUnavailableError();
  throw new TryonFailedError();
}

/**
 * PUT one already-manipulated avatar photo direct to R2 via its presigned URL, then
 * return the storage key the create call consumes. Reuses the closet's
 * {@link uploadToR2} (plain PUT, no auth header — the URL is the credential).
 */
export async function uploadAvatarPhoto(
  target: AvatarUploadTarget,
  uri: string,
  contentType: string,
): Promise<string> {
  await uploadToR2(target.url, uri, contentType);
  return target.key;
}

/**
 * Create the avatar from 1–3 uploaded source-photo keys and resolve to the finished
 * {@link AvatarState}. FASHN Model Creation is slow, so the POST is awaited under a
 * long timeout; a timeout, a network drop, or a `409` (already exists / creating)
 * all fall back to polling {@link fetchAvatar} until the status leaves `creating`.
 * 403 → {@link PlusRequiredError}; 503 → {@link TryonUnavailableError}; 502 / other
 * → {@link TryonFailedError} (retryable, photos kept so the caller can re-try).
 */
export async function createAvatar(photoKeys: readonly string[]): Promise<AvatarState> {
  let result: RequestResult<AvatarState>;
  try {
    result = await withTimeout(
      request<AvatarState>('/api/avatar', { method: 'POST', body: { photoKeys } }),
      CREATE_TIMEOUT_MS,
    );
  } catch {
    // Timeout or transport throw — the creation may still be running; poll it out.
    return pollAvatar();
  }

  if (result.ok) {
    return result.data.status === 'creating' ? pollAvatar() : result.data;
  }
  switch (result.status) {
    case 403:
      throw new PlusRequiredError();
    case 503:
      throw new TryonUnavailableError();
    case 409:
      // Already exists / still creating — resolve by reading the live state.
      return pollAvatar();
    case 0:
      // No status (dropped) — the create may have landed; poll it out.
      return pollAvatar();
    default:
      throw new TryonFailedError(); // 502 creation_failed, or anything unexpected.
  }
}

/**
 * Poll {@link fetchAvatar} until the avatar leaves `creating` (ready or failed), or
 * the cap is hit. A transient read failure mid-poll is not terminal — it retries
 * until the cap, then throws {@link TryonFailedError}. Used as the create call's
 * timeout/drop fallback and when onboarding resumes onto an already-`creating` row.
 */
export async function pollAvatar(): Promise<AvatarState> {
  const deadline = Date.now() + POLL_CAP_MS;
  for (;;) {
    let state: AvatarState | null = null;
    try {
      state = await fetchAvatar();
    } catch {
      // Transient read failure during polling — not terminal; retry until the cap.
    }
    if (state && state.status !== 'creating') return state;
    if (Date.now() >= deadline) throw new TryonFailedError();
    await delay(POLL_INTERVAL_MS);
  }
}

/** The DELETE /api/avatar reply — the verified deletion counts. */
export interface AvatarDeleteResult {
  readonly deleted: boolean;
  readonly storageObjectsDeleted: number;
  readonly remaining: number;
}

/**
 * Permanently delete the avatar and every render + storage object under it.
 * Throws {@link TryonFailedError} on any non-success so the confirm sheet can offer
 * a retry (the server leaves the DB untouched on a storage failure — safe to retry).
 */
export async function deleteAvatar(): Promise<AvatarDeleteResult> {
  const result = await request<AvatarDeleteResult>('/api/avatar', { method: 'DELETE' });
  if (result.ok) return result.data;
  throw new TryonFailedError();
}

// --- try-on reads / writes ---------------------------------------------------

function tryonPath(outfitId: string): string {
  return `/api/outfits/${outfitId}/tryon`;
}

/**
 * Read one outfit's try-on state (the poll/resume + cached-render read). Throws
 * {@link TryonFailedError} on any non-success so a caller can soft-fall-back; a 200
 * with `{ status: 'none' }` is a normal answer.
 */
export async function fetchTryon(outfitId: string): Promise<TryonState> {
  const result = await request<TryonState>(tryonPath(outfitId), { method: 'GET' });
  if (result.ok) return result.data;
  throw new TryonFailedError();
}

/**
 * Kick a try-on render for a saved outfit and resolve to the finished
 * {@link TryonState}. The sequential garment chain is slow, so the POST is awaited
 * under a long timeout; a timeout, a network drop, or a `409 already_running` all
 * fall back to polling {@link fetchTryon} until the status leaves `running`. A
 * non-stale complete render is returned by the server without spending a credit
 * (the claim idiom), so re-opening a rendered outfit is free.
 *
 * Errors branch by status: 403 → {@link PlusRequiredError}, 409 `no_avatar` →
 * {@link NoAvatarError}, 400 `no_garments` → {@link NoGarmentsError}, 429 →
 * {@link MonthlyLimitError} (carrying `used`/`limit`), 503 →
 * {@link TryonUnavailableError}, 502 / other → {@link TryonFailedError}.
 */
export async function generateTryon(outfitId: string): Promise<TryonState> {
  let result: RequestResult<TryonState>;
  try {
    result = await withTimeout(
      request<TryonState>(tryonPath(outfitId), { method: 'POST' }),
      TRYON_TIMEOUT_MS,
    );
  } catch {
    return pollTryon(outfitId);
  }

  if (result.ok) {
    return result.data.status === 'running' ? pollTryon(outfitId) : result.data;
  }
  switch (result.status) {
    case 403:
      throw new PlusRequiredError();
    case 400:
      throw new NoGarmentsError();
    case 409:
      // 409 is two cases: `no_avatar` (terminal, route to onboarding) vs
      // `already_running` (poll it out). Disambiguate on the body's `error` field.
      if (is409NoAvatar(result.body)) throw new NoAvatarError();
      return pollTryon(outfitId);
    case 429:
      throw new MonthlyLimitError(numberField(result.body, 'used'), numberField(result.body, 'limit'));
    case 503:
      throw new TryonUnavailableError();
    case 0:
      return pollTryon(outfitId);
    default:
      throw new TryonFailedError(); // 502 generation_failed, or anything unexpected.
  }
}

/** True when a 409 body names the `no_avatar` case (vs `already_running`). */
function is409NoAvatar(body: unknown): boolean {
  if (typeof body !== 'object' || body === null) return false;
  return (body as Record<string, unknown>).error === 'no_avatar';
}

/**
 * Poll {@link fetchTryon} until the render leaves `running` (or the cap is hit). A
 * transient read failure mid-poll is not terminal — it retries until the cap, then
 * throws {@link TryonFailedError}. Used as the POST's timeout/drop fallback and when
 * the sheet opens onto an already-`running` render.
 */
export async function pollTryon(outfitId: string): Promise<TryonState> {
  const deadline = Date.now() + POLL_CAP_MS;
  for (;;) {
    let state: TryonState | null = null;
    try {
      state = await fetchTryon(outfitId);
    } catch {
      // Transient read failure during polling — not terminal; retry until the cap.
    }
    if (state && state.status !== 'running') return state;
    if (Date.now() >= deadline) throw new TryonFailedError();
    await delay(POLL_INTERVAL_MS);
  }
}
