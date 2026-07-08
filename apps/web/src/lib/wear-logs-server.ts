/**
 * Server-only helpers for the wear-logs API: month-range parsing for the
 * calendar read, a uuid-shape guard for the per-item stats read, best-effort
 * weather resolution for the log-time snapshot, and the two owner-scoped queries
 * (a month's logs plus their referenced items, and one item's wear count).
 * Never import from a client bundle — the queries pull in the db client and the
 * weather lookup is server-only.
 */
import { and, asc, eq, gte, inArray, lt, sql } from 'drizzle-orm';

import type { Weather } from '@era/core/ovi';
import { type DbClient, items, wearLogs } from '@era/db';

import { fetchWeather } from './weather.ts';

/** Canonical `YYYY-MM` calendar-month shape for the GET `?month` filter. */
export const MONTH_RE = /^\d{4}-\d{2}$/;

// items.id is a pg `uuid`: a non-UUID id would surface as a Postgres uuid-syntax
// 500 instead of a clean 400. Reject at the boundary (mirrors outfit-server).
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Half-open `[start, endExclusive)` calendar-date range for one month. */
export interface MonthRange {
  readonly start: string; // YYYY-MM-01
  readonly endExclusive: string; // first day of the following month
}

/**
 * Validate a `YYYY-MM` month string and expand it to a half-open date range.
 * Returns null when the shape is wrong or the month is not 01..12, so the route
 * answers 400. The range is half-open so it needs no month-length arithmetic:
 * `worn_on >= start AND worn_on < endExclusive` selects exactly that month.
 */
export function parseMonth(value: string | null): MonthRange | null {
  if (value === null || !MONTH_RE.test(value)) {
    return null;
  }
  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(5, 7));
  if (month < 1 || month > 12) {
    return null;
  }
  const start = `${value}-01`;
  const nextYear = month === 12 ? year + 1 : year;
  const nextMonth = month === 12 ? 1 : month + 1;
  const endExclusive = `${String(nextYear).padStart(4, '0')}-${String(nextMonth).padStart(2, '0')}-01`;
  return { start, endExclusive };
}

/** True when `value` is a canonical uuid string — guards the stats `itemId`. */
export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_RE.test(value);
}

/**
 * Best-effort weather at log time. Missing coordinates or ANY fetch failure
 * resolve to null — capturing weather must never fail a wear log. `fetcher` is
 * injectable for tests and defaults to the real Open-Meteo lookup (which already
 * swallows its own failures — the try/catch is belt-and-suspenders).
 */
export async function resolveWearWeather(
  lat: number | null,
  lon: number | null,
  fetcher: (lat: number, lon: number) => Promise<Weather | null> = fetchWeather,
): Promise<Weather | null> {
  if (lat === null || lon === null) {
    return null;
  }
  try {
    return await fetcher(lat, lon);
  } catch {
    return null;
  }
}

/** One wear log in the calendar read, shaped for the client + recap builder. */
export interface MonthWearLog {
  id: string;
  wornOn: string;
  outfitId: string | null;
  itemIds: string[];
  weather: Weather | null;
  note: string | null;
}

/** Item columns the calendar/recap needs, before image-URL resolution. */
export interface MonthWearItem {
  id: string;
  name: string;
  category: string;
  purchasePrice: string | null;
  imageCutoutPath: string | null;
  imageRawPath: string | null;
}

/**
 * The caller's own wear logs for a month plus the deduped set of their items
 * those logs reference. Owner-scoped by `userId` on both queries: the log query
 * never sees another user's logs, and the item query drops any referenced id the
 * caller no longer owns (a deleted item leaves the log's `itemIds` but not the
 * item set). The route resolves each item's `imageUrl` from these rows.
 */
export async function loadWearLogsForMonth(
  db: DbClient,
  userId: string,
  range: MonthRange,
): Promise<{ logs: MonthWearLog[]; items: MonthWearItem[] }> {
  const logRows = await db
    .select({
      id: wearLogs.id,
      wornOn: wearLogs.wornOn,
      outfitId: wearLogs.outfitId,
      itemIds: wearLogs.itemIds,
      weather: wearLogs.weather,
      note: wearLogs.note,
    })
    .from(wearLogs)
    .where(and(eq(wearLogs.userId, userId), gte(wearLogs.wornOn, range.start), lt(wearLogs.wornOn, range.endExclusive)))
    .orderBy(asc(wearLogs.wornOn));

  const logs: MonthWearLog[] = logRows.map((row) => ({
    id: row.id,
    wornOn: row.wornOn,
    outfitId: row.outfitId,
    itemIds: row.itemIds ?? [],
    weather: (row.weather as Weather | null) ?? null,
    note: row.note,
  }));

  // Deduped set of every item referenced across the month's logs.
  const referenced = [...new Set(logs.flatMap((log) => log.itemIds))];
  if (referenced.length === 0) {
    return { logs, items: [] };
  }

  const itemRows = await db
    .select({
      id: items.id,
      name: items.name,
      category: items.category,
      purchasePrice: items.purchasePrice,
      imageCutoutPath: items.imageCutoutPath,
      imageRawPath: items.imageRawPath,
    })
    .from(items)
    .where(and(eq(items.userId, userId), inArray(items.id, referenced)));

  return { logs, items: itemRows };
}

/** Per-item wear stats for the item-detail card. */
export interface ItemWearStats {
  wearCount: number;
  purchasePrice: string | null;
}

/**
 * The caller's wear count for one owned item plus its purchase price, in a
 * single owner-scoped query. Returns null when the item is not the caller's
 * (missing or another user's) so the route answers `unknown_item`. `wearCount`
 * is a correlated count of the caller's wear logs whose `item_ids` array
 * contains the id (mirrors the items-list subquery).
 */
export async function loadItemWearStats(db: DbClient, userId: string, itemId: string): Promise<ItemWearStats | null> {
  const wearCount = sql<number>`(
    select count(*)::int from ${wearLogs}
    where ${itemId}::uuid = any(${wearLogs.itemIds}) and ${wearLogs.userId} = ${userId}
  )`;
  const [row] = await db
    .select({ purchasePrice: items.purchasePrice, wearCount })
    .from(items)
    .where(and(eq(items.id, itemId), eq(items.userId, userId)))
    .limit(1);
  if (!row) {
    return null;
  }
  return { wearCount: row.wearCount, purchasePrice: row.purchasePrice };
}
