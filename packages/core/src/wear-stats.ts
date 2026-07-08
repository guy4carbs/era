/**
 * @era/core — the wear-stats engine. Client-safe, deterministic, model-free.
 *
 * The honest arithmetic behind Era's wear-tracking surface: cost-per-wear on a
 * single owned piece, the monthly "your month, worn" recap, and the day-grouped
 * shape the calendar renders. Same doctrine as `@era/core/wardrobe-gaps` — this
 * module returns ONLY what one month of logs plus an owned-item lookup can
 * exactly support. No estimate is dressed up as a fact: a stat that isn't
 * derivable from the inputs is dropped, not guessed. A well-fed month yields a
 * rich recap; a thin or empty one yields zeros and nulls, never a throw and
 * never an invented number.
 *
 * `purchase_price` is a Postgres `numeric`, so it arrives as a string (or null);
 * every price path here parses defensively and treats a missing/garbage/
 * non-positive price as "no cost-per-wear", not zero. There is no copy in here —
 * the UI renders Quill's strings from the structured fields, exactly as the
 * wardrobe-gap engine hands the UI structured gaps rather than sentences.
 *
 * No server-only imports live here (no DB client, no R2, no env reads), so this
 * subpath is safe in a client bundle.
 *
 * Import via the `@era/core/wear-stats` subpath.
 */

import type { ItemCategory } from '@era/db';

// -----------------------------------------------------------------------------
// Input contract — mirrors the real rows the surfaces already carry
// -----------------------------------------------------------------------------

/**
 * One wear log for a month, trimmed to what the recap and calendar need. Mirrors
 * the `wear_logs` row: `wornOn` is the `date` column (a `YYYY-MM-DD` string),
 * `outfitId` is nullable (a log can reference loose items with no saved outfit),
 * and `itemIds` is the nullable `uuid[]` of the pieces worn that day.
 */
export interface WearLogLike {
  readonly id: string;
  readonly wornOn: string;
  readonly outfitId: string | null;
  readonly itemIds: readonly string[] | null;
}

/**
 * The owned-item lookup the recap resolves wear-logged ids against. Mirrors the
 * `items` row the closet already reads: `name` is NOT NULL, `category` is the
 * `item_category` enum, `imageUrl` is the resolved cutout URL (the client
 * supplies it; this module never touches R2), and `purchasePrice` is the
 * `numeric` column — a string, or null when unpriced. `name`/`imageUrl` are here
 * so the caller can pass its existing item shape unchanged; the recap itself
 * emits ids + categories and leaves name/image rendering to the client.
 */
export interface RecapItemLike {
  readonly id: string;
  readonly name: string;
  readonly category: ItemCategory;
  readonly imageUrl?: string;
  readonly purchasePrice: string | number | null;
}

// -----------------------------------------------------------------------------
// Output contract — structured stats the UI narrates
// -----------------------------------------------------------------------------

/** One row of the recap's most-worn ranking: an owned item and its month wears. */
export interface RecapTopItem {
  readonly itemId: string;
  readonly wearCount: number;
  readonly category: ItemCategory;
}

/**
 * The best-value pick of the month: the owned item with the LOWEST cost-per-wear
 * among those worn at least {@link MIN_WEARS_FOR_VALUE} times this month. The
 * threshold keeps a worn-once piece (whose one-wear cost is just its full price)
 * from masquerading as value. `costPerWear` is computed over the month's wears
 * only — honest as "this month's cost per wear", not a lifetime figure.
 */
export interface RecapBestValue {
  readonly itemId: string;
  readonly category: ItemCategory;
  readonly wearCount: number;
  readonly costPerWear: number;
}

/**
 * "Your month, worn." Every field is exactly computable from the month's logs
 * and the owned-item lookup:
 *   - `month` / `daysInMonth` — the calendar frame (`daysInMonth` is 0 for an
 *     unparseable month string).
 *   - `totalWears` — how many wears were logged this month (one row = one wear).
 *   - `distinctDaysWorn` — how many distinct days had at least one wear.
 *   - `topItems` — up to {@link MAX_TOP_ITEMS} owned items by month wears,
 *     descending, ties broken by first appearance in the logs (stable).
 *   - `mostWornCategory` — the category with the most item-wears, or null.
 *   - `bestCostPerWear` — see {@link RecapBestValue}, or null.
 * Deliberately absent: any "newly worn" / "new this month" count — one month of
 * logs cannot tell a first-ever wear from a repeat, so it is not reported.
 */
export interface MonthlyRecap {
  readonly month: string;
  readonly daysInMonth: number;
  readonly totalWears: number;
  readonly distinctDaysWorn: number;
  readonly topItems: readonly RecapTopItem[];
  readonly mostWornCategory: ItemCategory | null;
  readonly bestCostPerWear: RecapBestValue | null;
}

// -----------------------------------------------------------------------------
// Tuning
// -----------------------------------------------------------------------------

/** At most this many items surface in the recap's most-worn ranking. */
const MAX_TOP_ITEMS = 5;
/** A piece needs this many wears this month to qualify as a best-value pick. */
const MIN_WEARS_FOR_VALUE = 2;

// -----------------------------------------------------------------------------
// Cost per wear
// -----------------------------------------------------------------------------

/**
 * Parse a `numeric`-shaped price to a positive number, or null. A pg `numeric`
 * arrives as a string; `null`/`undefined`, non-finite, empty/garbage, and
 * non-positive values all collapse to null — the honest "no price on record".
 */
function parsePrice(price: string | number | null | undefined): number | null {
  if (price === null || price === undefined) {
    return null;
  }
  // Number('') and Number('  ') are 0, so an unpriced blank falls through to <=0.
  const value = typeof price === 'number' ? price : Number(price);
  if (!Number.isFinite(value) || value <= 0) {
    return null;
  }
  return value;
}

/**
 * Cost per wear for one owned piece: `purchasePrice / wearCount`, rounded to
 * whole cents. Returns null when the price is missing/unparseable/non-positive
 * or when `wearCount` is not a positive number — the surfaces render a dash, not
 * a misleading zero. The result carries at most two decimal places (e.g.
 * `"120.00"` over 8 wears is exactly `15`).
 */
export function costPerWear(purchasePrice: string | number | null | undefined, wearCount: number): number | null {
  const price = parsePrice(purchasePrice);
  if (price === null) {
    return null;
  }
  if (!Number.isFinite(wearCount) || wearCount <= 0) {
    return null;
  }
  return Math.round((price / wearCount) * 100) / 100;
}

// -----------------------------------------------------------------------------
// Calendar grouping
// -----------------------------------------------------------------------------

/**
 * Group wear logs by their `wornOn` day for the calendar view. Preserves input
 * order within each day; days appear in first-seen order. Total — an empty input
 * yields an empty map, and no assumption is made that the logs share a month
 * (the caller decides what window to pass).
 */
export function groupWearsByDay(logs: readonly WearLogLike[]): Map<string, WearLogLike[]> {
  const byDay = new Map<string, WearLogLike[]>();
  for (const log of logs) {
    const bucket = byDay.get(log.wornOn);
    if (bucket !== undefined) {
      bucket.push(log);
    } else {
      byDay.set(log.wornOn, [log]);
    }
  }
  return byDay;
}

// -----------------------------------------------------------------------------
// Monthly recap
// -----------------------------------------------------------------------------

/** Split a `YYYY-MM` string into a year + 0-based month index, or null. */
function parseMonth(month: string): { readonly year: number; readonly monthIndex: number } | null {
  const match = /^(\d{4})-(\d{2})$/.exec(month);
  if (match === null) {
    return null;
  }
  const [, yearStr, monthStr] = match;
  if (yearStr === undefined || monthStr === undefined) {
    return null;
  }
  const year = Number(yearStr);
  const monthNumber = Number(monthStr); // 1..12
  if (monthNumber < 1 || monthNumber > 12) {
    return null;
  }
  return { year, monthIndex: monthNumber - 1 };
}

/** Days in a given year/month — day 0 of the next month is the last of this one. */
function daysInMonthOf(year: number, monthIndex: number): number {
  return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
}

/**
 * Build the month's recap from its wear logs and an owned-item lookup. Logs are
 * defensively scoped to `month` (any whose `wornOn` falls outside it are
 * ignored), and wear-logged ids that aren't in `items` are skipped rather than
 * throwing — a deleted or unknown piece simply doesn't count toward the resolved
 * stats. An empty month (or an unparseable `month`) returns zeros and nulls.
 *
 * Every returned figure is exactly derivable from the inputs; nothing is
 * estimated. See {@link MonthlyRecap} for the field-by-field contract, including
 * why no "new this month" count is reported.
 */
export function buildMonthlyRecap(
  logs: readonly WearLogLike[],
  items: readonly RecapItemLike[],
  month: string,
): MonthlyRecap {
  const parsed = parseMonth(month);
  const daysInMonth = parsed !== null ? daysInMonthOf(parsed.year, parsed.monthIndex) : 0;

  // Only count wears that actually fall in the target month (wornOn is
  // YYYY-MM-DD; its first 7 chars are the YYYY-MM). An unparseable month keeps
  // nothing.
  const monthLogs = parsed !== null ? logs.filter((log) => log.wornOn.slice(0, 7) === month) : [];

  const itemById = new Map(items.map((item) => [item.id, item]));

  // Item-wear tally + distinct days, in one pass. wearByItem keeps first-seen
  // insertion order, which becomes the stable tiebreak for the ranking below.
  const wearByItem = new Map<string, number>();
  const daysWorn = new Set<string>();
  for (const log of monthLogs) {
    daysWorn.add(log.wornOn);
    for (const id of log.itemIds ?? []) {
      wearByItem.set(id, (wearByItem.get(id) ?? 0) + 1);
    }
  }

  // Resolve each tallied id to an owned item; unknown ids are skipped. Build the
  // ranking, the per-category tally, and the best-value pick together.
  const ranked: RecapTopItem[] = [];
  const wearByCategory = new Map<ItemCategory, number>();
  let bestCostPerWear: RecapBestValue | null = null;
  for (const [id, wearCount] of wearByItem) {
    const item = itemById.get(id);
    if (item === undefined) {
      continue;
    }
    ranked.push({ itemId: id, wearCount, category: item.category });
    wearByCategory.set(item.category, (wearByCategory.get(item.category) ?? 0) + wearCount);
    if (wearCount >= MIN_WEARS_FOR_VALUE) {
      const cpw = costPerWear(item.purchasePrice, wearCount);
      if (cpw !== null && (bestCostPerWear === null || cpw < bestCostPerWear.costPerWear)) {
        bestCostPerWear = { itemId: id, category: item.category, wearCount, costPerWear: cpw };
      }
    }
  }

  // Descending by wears; Array.sort is stable, so equal-wear items keep their
  // first-seen order.
  ranked.sort((a, b) => b.wearCount - a.wearCount);
  const topItems = ranked.slice(0, MAX_TOP_ITEMS);

  // Most-worn category: strict `>` keeps the first-seen category on a tie.
  let mostWornCategory: ItemCategory | null = null;
  let mostWornCount = 0;
  for (const [category, count] of wearByCategory) {
    if (count > mostWornCount) {
      mostWornCount = count;
      mostWornCategory = category;
    }
  }

  return {
    month,
    daysInMonth,
    totalWears: monthLogs.length,
    distinctDaysWorn: daysWorn.size,
    topItems,
    mostWornCategory,
    bestCostPerWear,
  };
}
