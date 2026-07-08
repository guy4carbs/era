/**
 * Local-calendar-date helpers for the wear surfaces.
 *
 * WHY (Gauge gate, TZ veto): a wear logged at, say, 7pm in Chicago must land on
 * TODAY's date, not tomorrow's. The server defaults an absent `wornOn` to UTC
 * today (`new Date().toISOString()`), so any evening log west of UTC would be
 * stamped a day ahead. The fix is to have the client send the user's LOCAL
 * calendar date. These helpers read the local Y/M/D off `Date` (never the UTC
 * getters, never `toISOString`), so "today" is the day the user is actually
 * living in. The calendar's today-ring and the month-nav clamp read from the
 * same source so every wear surface agrees on what "today"/"this month" is.
 */

/** A specific date's LOCAL calendar day as `YYYY-MM-DD` (zero-padded). */
export function localDateOf(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** Today's LOCAL calendar date as `YYYY-MM-DD` — the default a wear log dates to. */
export function localToday(): string {
  return localDateOf(new Date());
}

/** This LOCAL calendar month as `YYYY-MM` — the default month the calendar opens on. */
export function localMonthToday(): string {
  return localToday().slice(0, 7);
}
