/**
 * Feed API — the mobile pager's calls into the feed endpoints.
 *
 *   GET    /api/feed?cursor                 -> FeedPage
 *   POST   /api/posts        { outfitId }   -> { post: { id } }   (share)
 *   DELETE /api/posts        { postId }     -> ok                 (unshare)
 *   POST   /api/posts/[id]/like             -> { liked, count }
 *   DELETE /api/posts/[id]/like             -> { liked, count }
 *   POST   /api/posts/[id]/save             -> { saved, count }
 *   DELETE /api/posts/[id]/save             -> { saved, count }
 *   GET    /api/posts/[id]/shop-similar     -> ShopSimilarResult
 *   POST   /api/reports  { postId, reason, detail? } -> ok
 *   POST   /api/blocks   { username }       -> ok
 *   DELETE /api/blocks   { username }       -> ok
 *   POST   /api/follows  { username }       -> { following, followerCount }
 *   DELETE /api/follows  { username }       -> { following, followerCount }
 *
 * Every endpoint is owner-scoped, so each request carries the signed-in session
 * via Better Auth's `$fetch` (which injects the persisted cookie + baseURL). This
 * mirrors `components/design/api.ts`; the 429 → {@link LimitReachedError} idiom is
 * shared through `lib/rate-limit`, so a daily cap (share/report/block/follow) is
 * distinguishable from a genuine failure.
 *
 * Contract note (Forge owns the routes; these shapes are the plan's contract):
 *   - `sharePost` returns only the new post id (`{ post: { id } }`) — enough for
 *     OutfitCanvas to hold shared state; the full payload is not needed there.
 *   - `ShopSimilarResult` enriches each core `SlotMatch` item with the display URL
 *     the server resolves (the pure `@era/core` `OviItem` is storage-path-free).
 */
import type { FeedPage } from '@era/core/feed';

import { authClient } from '@/lib/auth-client';
import { limitFromFetchError, limitFromResponse } from '@/lib/rate-limit';

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
 * plugin-stored cookie. Throws {@link LimitReachedError} on a 429, or a plain
 * Error on any other non-success, so callers can surface a retry.
 */
async function apiFetch<T>(path: string, options: { method: string; body?: unknown }): Promise<T> {
  const client = authClient as unknown as AuthFetchClient;

  if (typeof client.$fetch === 'function') {
    const { data, error } = await client.$fetch<T>(`${baseURL}${path}`, options);
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

// --- feed pagination --------------------------------------------------------

/** One page of the ranked feed. Pass the previous page's `nextCursor` to advance. */
export async function fetchFeed(cursor?: string | null): Promise<FeedPage> {
  const query = cursor ? `?cursor=${encodeURIComponent(cursor)}` : '';
  return apiFetch<FeedPage>(`/api/feed${query}`, { method: 'GET' });
}

// --- like / save (engagement) ----------------------------------------------

/** The like route's reply — the resulting bit and the live count. */
export interface LikeResult {
  readonly liked: boolean;
  readonly count: number;
}

/** The save route's reply — the resulting bit and the live count. */
export interface SaveResult {
  readonly saved: boolean;
  readonly count: number;
}

/** Like a post (idempotent server-side). Returns `{ liked: true, count }`. */
export async function likePost(postId: string): Promise<LikeResult> {
  return apiFetch<LikeResult>(`/api/posts/${postId}/like`, { method: 'POST' });
}

/** Remove a like (idempotent). Returns `{ liked: false, count }`. */
export async function unlikePost(postId: string): Promise<LikeResult> {
  return apiFetch<LikeResult>(`/api/posts/${postId}/like`, { method: 'DELETE' });
}

/** Save a post (idempotent). Returns `{ saved: true, count }`. */
export async function savePost(postId: string): Promise<SaveResult> {
  return apiFetch<SaveResult>(`/api/posts/${postId}/save`, { method: 'POST' });
}

/** Remove a save (idempotent). Returns `{ saved: false, count }`. */
export async function unsavePost(postId: string): Promise<SaveResult> {
  return apiFetch<SaveResult>(`/api/posts/${postId}/save`, { method: 'DELETE' });
}

// --- follow (creator relationship) -----------------------------------------

/** The follow route's reply — the resulting edge state and the creator's live follower count. */
export interface FollowResult {
  readonly following: boolean;
  readonly followerCount: number;
}

/** Follow a creator by username. 429 → {@link LimitReachedError} (daily follow cap). */
export async function followUser(username: string): Promise<FollowResult> {
  return apiFetch<FollowResult>('/api/follows', { method: 'POST', body: { username } });
}

/** Unfollow a creator by username (uncapped). */
export async function unfollowUser(username: string): Promise<FollowResult> {
  return apiFetch<FollowResult>('/api/follows', { method: 'DELETE', body: { username } });
}

// --- share / unshare (posting a look TO the feed) --------------------------

/** The subject a share creates a post from — an outfit or an era. */
export type ShareSubject = { readonly outfitId: string } | { readonly eraId: string };

/** The new-post reply — only the id is needed to hold shared state on a detail surface. */
export interface SharePostResult {
  readonly post: { readonly id: string };
}

/** Share an outfit or era to the feed. Idempotent server-side; 429 → daily post cap. */
export async function sharePost(subject: ShareSubject): Promise<SharePostResult> {
  return apiFetch<SharePostResult>('/api/posts', { method: 'POST', body: subject });
}

/** Take a shared post back down (owner-scoped, uncapped). */
export async function unsharePost(postId: string): Promise<void> {
  await apiFetch('/api/posts', { method: 'DELETE', body: { postId } });
}

// --- shop similar from your closet -----------------------------------------

/** One of the viewer's own items that wears in a posted item's place, with its resolved image. */
export interface ShopSimilarMatch {
  readonly itemId: string;
  readonly name: string;
  readonly displayUrl: string | null;
}

/** The viewer's matches for one slot of the posted look. */
export interface ShopSimilarSlot {
  readonly slot: string;
  readonly matches: readonly ShopSimilarMatch[];
}

/** The shop-similar reply — the posted look mapped onto the viewer's closet, per slot. */
export interface ShopSimilarResult {
  readonly slots: readonly ShopSimilarSlot[];
}

/**
 * The viewer's closet matches for a posted look. `signal` cancels the request when
 * the sheet closes so a slow response can't settle onto a dismissed sheet.
 */
export async function fetchShopSimilar(
  postId: string,
  signal: AbortSignal,
): Promise<ShopSimilarResult> {
  const cookie = (authClient as unknown as AuthFetchClient).getCookie?.() ?? '';
  // `$fetch` has no abort seam, so shop-similar (the one cancelable read) uses a
  // bare authed fetch with the plugin cookie so `signal` can tear it down.
  const response = await fetch(`${baseURL}/api/posts/${postId}/shop-similar`, {
    method: 'GET',
    headers: { cookie },
    signal,
  });
  if (!response.ok) {
    throw new Error(`shop-similar failed: ${response.status}`);
  }
  return (await response.json()) as ShopSimilarResult;
}

// --- report / block (UGC safety) -------------------------------------------

import type { ReportReason } from '@era/core/feed';

/** The report form's payload — a post id, a reason, and optional free-text detail. */
export interface ReportInput {
  readonly postId: string;
  readonly reason: ReportReason;
  readonly detail?: string;
}

/** File a report on a post. 429 → {@link LimitReachedError} (daily report cap). */
export async function report(input: ReportInput): Promise<void> {
  await apiFetch('/api/reports', {
    method: 'POST',
    body: {
      postId: input.postId,
      reason: input.reason,
      ...(input.detail && input.detail.length > 0 ? { detail: input.detail } : {}),
    },
  });
}

/** Block a creator by username (bidirectional invisibility). 429 → daily block cap. */
export async function block(username: string): Promise<void> {
  await apiFetch('/api/blocks', { method: 'POST', body: { username } });
}

/** Unblock a creator by username (uncapped). */
export async function unblock(username: string): Promise<void> {
  await apiFetch('/api/blocks', { method: 'DELETE', body: { username } });
}
