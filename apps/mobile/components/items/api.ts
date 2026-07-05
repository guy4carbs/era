/**
 * Closet API — the mobile calls into the item endpoints.
 *
 *   GET    /api/items          -> { items: ItemWithDisplay[] }
 *   POST   /api/upload-url      { ext, contentType } -> { url, key, expiresIn }
 *   POST   /api/process-item    { rawKey } -> { item, processed }
 *   PATCH  /api/items/[id]      { updates?, confirm? } -> { item }
 *
 * Every endpoint above is owner-scoped, so each request must carry the signed-in
 * session. Better Auth's Expo plugin patches the client's own fetch
 * (`authClient.$fetch`) to inject the persisted session cookie and the baseURL,
 * so calling through `$fetch` is what attaches credentials — a bare `fetch`
 * would go out anonymous and 401. When `$fetch` is unavailable we fall back to a
 * plain fetch that reads the cookie via the plugin-exposed `getCookie()`. This
 * mirrors the quiz's `deriveProfile` contract.
 *
 * The presigned R2 PUT is the ONE exception: it goes DIRECT to R2 with a plain
 * fetch and NO auth header — the URL itself is the credential. See
 * {@link uploadToR2}.
 */
import { authClient } from '@/lib/auth-client';
import { limitFromFetchError, limitFromResponse } from '@/lib/rate-limit';

import type { ItemCategory, ItemPattern } from './constants';

/** How a piece entered the wardrobe (mirrors the `item_source` DB enum). */
export type ItemSource = 'photo' | 'link' | 'email_import';

/** An item as the server models it (the fields the closet reads and edits). */
export interface Item {
  readonly id: string;
  readonly name: string;
  readonly category: ItemCategory;
  readonly brand: string | null;
  readonly colorPrimary: string | null;
  readonly colors: readonly string[] | null;
  readonly pattern: ItemPattern | null;
  readonly tagsConfirmed: boolean;
  /** Provenance — drives the detail sheet's "added from…" line. */
  readonly source: ItemSource;
  /** Numeric returns over JSON as a string; null when unpriced. */
  readonly purchasePrice: string | null;
  readonly currency: string | null;
  /** Visibility flag — archived items leave the gallery (never deleted). */
  readonly archived: boolean;
}

/**
 * An item from `GET /api/items`, carrying its resolved (presigned/public) URL and
 * the owner's wear count for this piece (0 until wear logging ships).
 */
export interface ItemWithDisplay extends Item {
  readonly displayUrl: string | null;
  readonly wearCount: number;
}

/** The subset of fields the confirm editor can change. */
export interface ItemUpdates {
  category?: ItemCategory;
  name?: string;
  brand?: string;
  colorPrimary?: string;
  colors?: string[];
  pattern?: ItemPattern;
}

/** A short-lived presigned PUT target for a raw upload. */
export interface UploadTarget {
  readonly url: string;
  readonly key: string;
  readonly expiresIn: number;
}

/** The result of kicking off background processing on a freshly uploaded raw. */
export interface ProcessResult {
  readonly item: Item;
  readonly processed: {
    /** Whether background removal produced a cutout. */
    readonly bg: boolean;
    /** Whether vision tagging landed usable tags — drives processed vs manual. */
    readonly vision: boolean;
  };
}

/**
 * The result of importing a piece from a product URL. Mirrors {@link ProcessResult}
 * (the item ran the same processing pipeline) and adds `meta`, the provenance the
 * server read off the page. The shape of `meta` is owned by the import route; the
 * client only consumes `item` and `processed`, so it stays an opaque record here.
 */
export interface ImportResult extends ProcessResult {
  readonly meta: Record<string, unknown>;
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

/** Every item the signed-in user owns, each with its display URL resolved. */
export async function fetchItems(): Promise<readonly ItemWithDisplay[]> {
  const { items } = await apiFetch<{ items: readonly ItemWithDisplay[] }>('/api/items', {
    method: 'GET',
  });
  return items;
}

/** Read the owner's closet privacy flag (`true` = only the owner sees cutouts). */
export async function getPrivacy(): Promise<boolean> {
  const { isPrivate } = await apiFetch<{ isPrivate: boolean }>('/api/profile/privacy', {
    method: 'GET',
  });
  return isPrivate;
}

/** Set the owner's closet privacy flag; returns the server's stored value. */
export async function setPrivacy(isPrivate: boolean): Promise<boolean> {
  const result = await apiFetch<{ isPrivate: boolean }>('/api/profile/privacy', {
    method: 'PATCH',
    body: { isPrivate },
  });
  return result.isPrivate;
}

/** Archive an item — it leaves the gallery but is not deleted. */
export async function archiveItem(id: string): Promise<Item> {
  const { item } = await apiFetch<{ item: Item }>(`/api/items/${id}`, {
    method: 'PATCH',
    body: { archived: true },
  });
  return item;
}

/** Ask the server for a short-lived presigned PUT to R2 for a raw upload. */
export async function requestUpload(
  ext: string,
  contentType: string,
): Promise<UploadTarget> {
  return apiFetch<UploadTarget>('/api/upload-url', {
    method: 'POST',
    body: { ext, contentType },
  });
}

/**
 * PUT the image bytes DIRECT to R2 using the presigned URL. Plain fetch, no auth
 * header — the signature in the URL is the credential. `contentType` MUST match
 * the value handed to {@link requestUpload}, or R2 rejects the signature.
 */
export async function uploadToR2(
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
    throw new Error(`upload failed: ${response.status}`);
  }
}

/** Kick off background removal + vision tagging on an uploaded raw. */
export async function processItem(rawKey: string): Promise<ProcessResult> {
  return apiFetch<ProcessResult>('/api/process-item', {
    method: 'POST',
    body: { rawKey },
  });
}

/**
 * Import a piece from a product URL. The server fetches the linked page, reads
 * the product off it, and runs the same processing pipeline a photo upload does —
 * so the result hands straight to the confirm step. Throws on any non-success
 * (the 4xx `{ error }` case included), letting the caller surface the link retry.
 */
export async function importFromUrl(url: string): Promise<ImportResult> {
  return apiFetch<ImportResult>('/api/import-from-url', {
    method: 'POST',
    body: { url },
  });
}

/** Patch an item's tags and/or confirm it. Returns the updated item. */
export async function patchItem(
  id: string,
  payload: { updates?: ItemUpdates; confirm?: boolean },
): Promise<Item> {
  const { item } = await apiFetch<{ item: Item }>(`/api/items/${id}`, {
    method: 'PATCH',
    body: payload,
  });
  return item;
}
