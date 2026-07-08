/**
 * Wear API — the mobile calls into the wear-tracking read endpoints.
 *
 *   GET /api/wear-logs?month=YYYY-MM
 *       -> { logs:  [{ id, wornOn, outfitId, itemIds, weather, note }],
 *            items: [{ id, name, category, imageUrl, purchasePrice }] }
 *   GET /api/wear-logs/stats?itemId=<uuid>
 *       -> { itemId, wearCount, purchasePrice }
 *
 * Both are owner-scoped, so each request carries the signed-in session. As in the
 * Ovi + closet clients, Better Auth's Expo plugin patches the client's own fetch
 * (`authClient.$fetch`) to attach the persisted session cookie and baseURL — a
 * bare fetch would go out anonymous and 401. The write side (logging a wear) lives
 * in `components/ovi/api.ts` (`logWear`); this module is the read half.
 *
 * The shapes here mirror the `@era/core/wear-stats` input contract exactly, so a
 * month's `{ logs, items }` feeds `buildMonthlyRecap` / `groupWearsByDay` and a
 * single item's stats feed `costPerWear` with no reshaping.
 */
import { authClient } from '@/lib/auth-client';
import { limitFromFetchError, limitFromResponse } from '@/lib/rate-limit';

import type { OviWeather } from '@/components/ovi';
import type { ItemCategory } from '@/components/items/constants';

/** One wear log for the viewed month — the `wear_logs` row the calendar reads. */
export interface WearMonthLog {
  readonly id: string;
  readonly wornOn: string;
  readonly outfitId: string | null;
  readonly itemIds: readonly string[] | null;
  /** Conditions snapshotted at log time when coords were supplied, else null. */
  readonly weather: OviWeather | null;
  readonly note: string | null;
}

/** An owned item referenced by the month's logs, with its resolved cutout URL. */
export interface WearMonthItem {
  readonly id: string;
  readonly name: string;
  readonly category: ItemCategory;
  readonly imageUrl: string | null;
  /** Numeric returns over JSON as a string; null when unpriced. */
  readonly purchasePrice: string | null;
}

/** The month endpoint's payload — logs plus the deduped items they reference. */
export interface WearMonth {
  readonly logs: readonly WearMonthLog[];
  readonly items: readonly WearMonthItem[];
}

/** Per-item wear stats for the item-detail card. */
export interface ItemWearStats {
  readonly itemId: string;
  readonly wearCount: number;
  readonly purchasePrice: string | null;
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
async function apiFetch<T>(path: string, options: { method: string; body?: unknown }): Promise<T> {
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

/** The caller's wear logs for a `YYYY-MM` month plus the items they reference. */
export async function fetchWearMonth(month: string): Promise<WearMonth> {
  return apiFetch<WearMonth>(`/api/wear-logs?month=${month}`, { method: 'GET' });
}

/** The caller's wear count + purchase price for one owned item. */
export async function fetchItemWearStats(itemId: string): Promise<ItemWearStats> {
  return apiFetch<ItemWearStats>(`/api/wear-logs/stats?itemId=${itemId}`, { method: 'GET' });
}
