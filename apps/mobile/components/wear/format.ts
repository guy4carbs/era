/**
 * Wear formatting — money + calendar-month helpers for the wear surfaces.
 *
 * Money follows the app's existing idiom (see closet ItemDetailSheet): a plain
 * `CUR amount` join, never `Intl` — Hermes ships no bundled currency data, and the
 * closet already renders prices this way, so the wear surfaces match. Currency is
 * OPTIONAL: the item-detail card knows it (`item.currency`), the recap's month
 * feed does not carry it, so a bare number is the honest fallback there.
 *
 * Month helpers work in UTC to match the server's `wornOn` (a pg `date` defaulted
 * to today UTC) and the `@era/core/wear-stats` `YYYY-MM` contract. Every parser is
 * defensive: a malformed month yields sensible zeros, never a throw.
 */

/** Month names for a mid-sentence, `Intl`-free label — index 0 = January. */
const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const;

/** Single-column headers for the calendar grid, Sunday-first. */
export const WEEKDAY_LABELS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'] as const;

/**
 * Format a money amount the app's way: `"USD 15"`, `"USD 4.50"`, or — when no
 * currency is known — the bare number. A whole amount drops the decimals; a
 * fractional one shows exactly two. Mirrors the closet's price join.
 */
export function formatMoney(amount: number, currency?: string | null): string {
  const rounded = Math.round(amount * 100) / 100;
  const body = Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(2);
  return currency ? `${currency} ${body}` : body;
}

/** Split a `YYYY-MM` string into year + 0-based month index, or null. */
function parseYearMonth(month: string): { readonly year: number; readonly monthIndex: number } | null {
  const match = /^(\d{4})-(\d{2})$/.exec(month);
  if (match === null) return null;
  const year = Number(match[1]);
  const monthNumber = Number(match[2]); // 1..12
  if (!Number.isFinite(year) || monthNumber < 1 || monthNumber > 12) return null;
  return { year, monthIndex: monthNumber - 1 };
}

/** Zero-pad a 1- or 2-digit number to two chars (`3` → `"03"`). */
function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/** The current calendar month as `YYYY-MM`, in UTC. */
export function currentMonth(): string {
  return new Date().toISOString().slice(0, 7);
}

/** Today's calendar date as `YYYY-MM-DD`, in UTC (matches a wear log's default). */
export function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * A human month label from a `YYYY-MM` string — `"July 2026"`. An unparseable
 * month returns the input unchanged so the caller's guard can decide the copy.
 */
export function monthLabel(month: string): string {
  const parsed = parseYearMonth(month);
  if (parsed === null) return month;
  return `${MONTH_NAMES[parsed.monthIndex]} ${parsed.year}`;
}

/** Shift a `YYYY-MM` month by `delta` months (±). Invalid input passes through. */
export function shiftMonth(month: string, delta: number): string {
  const parsed = parseYearMonth(month);
  if (parsed === null) return month;
  const shifted = new Date(Date.UTC(parsed.year, parsed.monthIndex + delta, 1));
  return `${shifted.getUTCFullYear()}-${pad2(shifted.getUTCMonth() + 1)}`;
}

/**
 * The weekday index (0 = Sunday) the 1st of a `YYYY-MM` month falls on — the
 * leading-cell offset the grid needs. Returns 0 for an unparseable month.
 */
export function firstWeekdayOf(month: string): number {
  const parsed = parseYearMonth(month);
  if (parsed === null) return 0;
  return new Date(Date.UTC(parsed.year, parsed.monthIndex, 1)).getUTCDay();
}

/** The `YYYY-MM-DD` date of a given day number within a `YYYY-MM` month. */
export function dayDate(month: string, day: number): string {
  return `${month}-${pad2(day)}`;
}

/** True when `a` is the same month as or before `b` (both `YYYY-MM`). */
export function monthAtOrBefore(a: string, b: string): boolean {
  return a <= b;
}
