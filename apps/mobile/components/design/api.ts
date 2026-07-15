/**
 * Design API — the mobile calls into the outfit + era endpoints.
 *
 *   GET  /api/outfits              -> { outfits: OutfitSummary[] }
 *   POST /api/outfits               { name?, occasion?, items, coverImagePath? } -> { outfit }
 *   GET  /api/outfits/[id]          -> { outfit: OutfitDetail }
 *   PATCH /api/outfits/[id]         { name?, occasion?, items?, coverImagePath? } -> { outfit }
 *   POST /api/outfits/cover-url     { ext, contentType } -> { url, key, expiresIn }
 *   GET  /api/eras                  -> { eras: EraSummary[] }
 *   POST /api/eras                  { title, description? } -> { era }
 *   POST /api/eras/[id]/outfits     { outfitId } -> { success }
 *
 * Every endpoint is owner-scoped, so each request carries the signed-in session.
 * Better Auth's Expo plugin patches the client's own fetch (`authClient.$fetch`)
 * to inject the persisted session cookie and baseURL — calling through `$fetch`
 * is what attaches credentials. This mirrors the closet's `components/items/api.ts`.
 *
 * The presigned R2 PUT for a composed cover is the ONE exception: it goes DIRECT
 * to R2 with a plain fetch and NO auth header — the URL itself is the credential.
 * That PUT reuses {@link uploadToR2} from the closet API (same contract).
 */
import { authClient } from '@/lib/auth-client';
import { limitFromFetchError, limitFromResponse } from '@/lib/rate-limit';

/** A single item placement within an outfit — the pinned transform contract. */
export interface OutfitItemTransform {
  readonly itemId: string;
  /** Stacking order; higher renders on top. Integer >= 0. */
  readonly layerOrder: number;
  /** Normalized centre position on the stage, 0..1. */
  readonly posX: number;
  readonly posY: number;
  /** Relative scale, 0.05..10. */
  readonly scale: number;
  /** Rotation in degrees, -360..360. */
  readonly rotation: number;
}

/** An outfit as the design tab lists it (cover imagery + counts). */
export interface OutfitSummary {
  readonly id: string;
  readonly name: string | null;
  readonly occasion: string | null;
  /** Composed cover, when one was saved. */
  readonly coverUrl: string | null;
  /** Member count — drives the piece-count line. */
  readonly itemCount: number;
  /** Up to four member thumbnails for the fallback collage when there's no cover. */
  readonly thumbnailUrls: readonly string[];
  /** The caller's live feed post for this outfit, or null when it isn't shared. */
  readonly sharedPostId: string | null;
}

/** One member of the full "reopen" payload: a transform joined to its item. */
export interface OutfitDetailMember extends OutfitItemTransform {
  readonly item: {
    readonly displayUrl: string | null;
    readonly name: string;
  };
}

/** The full outfit the canvas reopens from. */
export interface OutfitDetail {
  readonly id: string;
  readonly name: string | null;
  readonly occasion: string | null;
  readonly coverUrl: string | null;
  readonly items: readonly OutfitDetailMember[];
  /** The caller's live feed post for this outfit, or null when it isn't shared. */
  readonly sharedPostId: string | null;
}

/** An era as the design tab lists it (its own cover, or a member-cover collage). */
export interface EraSummary {
  readonly id: string;
  readonly title: string;
  readonly description: string | null;
  readonly season: string | null;
  readonly coverUrl: string | null;
  readonly outfitCount: number;
  readonly outfitCovers: readonly string[];
  /** The caller's live feed post for this era, or null when it isn't shared. */
  readonly sharedPostId: string | null;
}

/** The fields written when saving (creating or updating) an outfit. */
export interface OutfitSavePayload {
  readonly name?: string | null;
  readonly occasion?: string | null;
  readonly items: readonly OutfitItemTransform[];
  readonly coverImagePath?: string | null;
}

/** A short-lived presigned PUT target for a composed cover. */
export interface CoverUploadTarget {
  readonly url: string;
  readonly key: string;
  readonly expiresIn: number;
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

/**
 * Authenticated JSON call into an Era API route. Prefers the auth client's
 * `$fetch` (which attaches the session), falling back to a bare fetch with the
 * plugin-stored cookie. Throws on any non-success so callers surface a retry.
 */
async function apiFetch<T>(
  path: string,
  options: { method: string; body?: unknown },
): Promise<T> {
  const client = authClient as unknown as AuthFetchClient;

  if (typeof client.$fetch === 'function') {
    const { data, error } = await client.$fetch<T>(path, options);
    if (error) {
      const limit = limitFromFetchError(error);
      if (limit) throw limit;
      throw new Error(error.message ?? `${path} failed`);
    }
    if (data === null) {
      throw new Error(`${path} failed`);
    }
    return data;
  }

  const cookie = client.getCookie?.() ?? '';
  const headers: Record<string, string> = { cookie };
  if (options.body !== undefined) {
    headers['content-type'] = 'application/json';
  }
  const response = await fetch(`${baseURL}${path}`, {
    method: options.method,
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });
  if (!response.ok) {
    if (response.status === 429) {
      throw await limitFromResponse(response);
    }
    throw new Error(`${path} failed: ${response.status}`);
  }
  return (await response.json()) as T;
}

/** Every outfit the signed-in user owns, newest-first, with cover imagery. */
export async function fetchOutfits(): Promise<readonly OutfitSummary[]> {
  const { outfits } = await apiFetch<{ outfits: readonly OutfitSummary[] }>('/api/outfits', {
    method: 'GET',
  });
  return outfits;
}

/** The caller's eras, newest-first, each with cover imagery + an outfit count. */
export async function fetchEras(): Promise<readonly EraSummary[]> {
  const { eras } = await apiFetch<{ eras: readonly EraSummary[] }>('/api/eras', {
    method: 'GET',
  });
  return eras;
}

/** The full reopen payload for one outfit — transforms + member display URLs. */
export async function fetchOutfitDetail(id: string): Promise<OutfitDetail> {
  const { outfit } = await apiFetch<{ outfit: OutfitDetail }>(`/api/outfits/${id}`, {
    method: 'GET',
  });
  return outfit;
}

/** Create a new outfit from its canvas placements. Returns the inserted row. */
export async function createOutfit(payload: OutfitSavePayload): Promise<{ id: string }> {
  const { outfit } = await apiFetch<{ outfit: { id: string } }>('/api/outfits', {
    method: 'POST',
    body: payload,
  });
  return outfit;
}

/** Update an outfit; supplying `items` replaces its entire placement set. */
export async function updateOutfit(id: string, payload: OutfitSavePayload): Promise<{ id: string }> {
  const { outfit } = await apiFetch<{ outfit: { id: string } }>(`/api/outfits/${id}`, {
    method: 'PATCH',
    body: payload,
  });
  return outfit;
}

/** Mint a presigned PUT so the client can upload a composed cover to R2. */
export async function requestCoverUpload(
  ext: string,
  contentType: string,
): Promise<CoverUploadTarget> {
  return apiFetch<CoverUploadTarget>('/api/outfits/cover-url', {
    method: 'POST',
    body: { ext, contentType },
  });
}

/**
 * PUT the composed cover bytes DIRECT to R2 using the presigned URL. Plain fetch,
 * no auth header — the signature in the URL is the credential. `contentType` MUST
 * match the value handed to {@link requestCoverUpload}, or R2 rejects the signature.
 */
export async function uploadCover(
  url: string,
  uri: string,
  contentType: string,
): Promise<void> {
  const blob = await (await fetch(uri)).blob();
  const response = await fetch(url, {
    method: 'PUT',
    headers: { 'content-type': contentType },
    body: blob,
  });
  if (!response.ok) {
    throw new Error(`cover upload failed: ${response.status}`);
  }
}

/** Create an era for the caller. Returns the inserted row. */
export async function createEra(title: string, description?: string): Promise<{ id: string }> {
  const { era } = await apiFetch<{ era: { id: string } }>('/api/eras', {
    method: 'POST',
    body: { title, ...(description ? { description } : {}) },
  });
  return era;
}

/** Add an outfit to an era. Idempotent server-side (re-adding is a no-op). */
export async function addOutfitToEra(eraId: string, outfitId: string): Promise<void> {
  await apiFetch<{ success: boolean }>(`/api/eras/${eraId}/outfits`, {
    method: 'POST',
    body: { outfitId },
  });
}
