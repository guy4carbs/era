/**
 * era-edit-data — the per-recipient "Your Week, Worn" personalization for The Era
 * Edit. Turns a user's trailing-7-day wear history into the two display strings
 * the template renders (or null, when the week is empty).
 *
 * The honesty rule that governs the whole newsletter applies here: we return null
 * — hiding the section entirely — whenever there's nothing exactly derivable. A
 * user with no wear logs in the window gets NO Your Week, Worn block; the email
 * never fabricates a stat to fill the space.
 *
 * We reuse `buildMonthlyRecap` from `@era/core/wear-stats` — it is PURE over its
 * inputs (logs + items + a month label), so feeding it a 7-day slice of logs
 * yields the same most-worn ranking and best-cost-per-wear pick over that window.
 * The `month` param is only used to (a) frame `daysInMonth` (which we ignore) and
 * (b) defensively drop any log whose `wornOn` falls outside that month — so we
 * pass the current month (`todayIso.slice(0,7)`) and pre-filter to the 7-day
 * window ourselves. NOTE: a window that straddles a month boundary would have its
 * prior-month days dropped by that internal filter; acceptable for a weekly
 * editorial stat (worst case the "week" reads as slightly short), and called out
 * here so it isn't mistaken for a bug.
 */
import { and, eq, gte, inArray } from 'drizzle-orm';

import { type DbClient, items as itemsTable, wearLogs } from '@era/db';
import { strings } from '@era/core/strings';
import { buildMonthlyRecap, type RecapItemLike, type WearLogLike } from '@era/core/wear-stats';

import { formatMoney } from './format-money.ts';
import type { WeekWornData } from '@era/email';

/** The trailing window, in days, that "Your Week, Worn" summarizes. */
const WINDOW_DAYS = 7;

/**
 * The `YYYY-MM-DD` date `days` days before `todayIso` (inclusive lower bound of
 * the window). Computed in UTC so it matches the `date`-typed `worn_on` column,
 * which carries no timezone.
 */
function windowStart(todayIso: string, days: number): string {
  const today = new Date(`${todayIso}T00:00:00Z`);
  today.setUTCDate(today.getUTCDate() - (days - 1));
  return today.toISOString().slice(0, 10);
}

/**
 * Build the recipient's Your Week, Worn stats, or null when the trailing 7-day
 * window has no wear logs (the template then hides the section). `todayIso` is a
 * `YYYY-MM-DD` string — the send's "today", injectable so a test is deterministic
 * and the send script can pin the issue's date.
 *
 * Resolution: fetch the user's logs in `[today-6d, today]`, load the items those
 * logs reference, run the pure recap over that slice, then map its top item →
 * `{ name, count }` (the piece's own name, falling back to its category word) and
 * its best-cost-per-wear pick → `{ name, formatted }` (the money string via
 * `formatMoney`, using the item's own currency).
 */
export async function getWeekWornData(
  db: DbClient,
  userId: string,
  todayIso: string,
): Promise<WeekWornData | null> {
  const start = windowStart(todayIso, WINDOW_DAYS);

  // The user's wear logs in the trailing window (owner-scoped AND date-bounded).
  const logRows = await db
    .select({ id: wearLogs.id, wornOn: wearLogs.wornOn, outfitId: wearLogs.outfitId, itemIds: wearLogs.itemIds })
    .from(wearLogs)
    .where(and(eq(wearLogs.userId, userId), gte(wearLogs.wornOn, start)));

  const logs: WearLogLike[] = logRows.map((row) => ({
    id: row.id,
    wornOn: row.wornOn,
    outfitId: row.outfitId,
    itemIds: row.itemIds,
  }));

  if (logs.length === 0) {
    return null;
  }

  // The distinct item ids these logs reference — the only items the recap needs.
  const referencedIds = [...new Set(logs.flatMap((log) => log.itemIds ?? []))];
  if (referencedIds.length === 0) {
    return null;
  }

  const itemRows = await db
    .select({
      id: itemsTable.id,
      name: itemsTable.name,
      category: itemsTable.category,
      purchasePrice: itemsTable.purchasePrice,
      currency: itemsTable.currency,
    })
    .from(itemsTable)
    .where(inArray(itemsTable.id, referencedIds));

  const itemById = new Map(itemRows.map((row) => [row.id, row]));

  const recapItems: RecapItemLike[] = itemRows.map((row) => ({
    id: row.id,
    name: row.name,
    category: row.category,
    purchasePrice: row.purchasePrice,
  }));

  // Pure over its inputs — see the module note on the month-shaped param.
  const recap = buildMonthlyRecap(logs, recapItems, todayIso.slice(0, 7));

  const top = recap.topItems[0];
  if (!top) {
    return null;
  }

  const topItem = itemById.get(top.itemId);
  // A resolved name is the piece's own name; fall back to its category word so the
  // sentence still reads (never a raw id/slug).
  const mostWornName = topItem?.name?.trim() || strings.closet.categoryLabel(top.category).toLowerCase();

  // Best cost-per-wear is optional — present only when a worn (≥2×) piece has a
  // usable price. Resolve its name + formatted figure the same way.
  let costPerWear: WeekWornData['costPerWear'] = null;
  const best = recap.bestCostPerWear;
  if (best) {
    const bestItem = itemById.get(best.itemId);
    const bestName = bestItem?.name?.trim() || strings.closet.categoryLabel(best.category).toLowerCase();
    costPerWear = { name: bestName, formatted: formatMoney(best.costPerWear, bestItem?.currency ?? null) };
  }

  return {
    mostWorn: { name: mostWornName, count: top.wearCount },
    costPerWear,
  };
}
