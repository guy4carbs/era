/**
 * Shapes for the wear-calendar surface (`/worn`), mirroring what
 * `GET /api/wear-logs?month=YYYY-MM` returns. `WornLog` is structurally a
 * `WearLogLike` and `WornItem` a `RecapItemLike`, so both feed the `@era/core/
 * wear-stats` engine (`buildMonthlyRecap`, `groupWearsByDay`) unchanged.
 */
import type { Weather } from '@era/core/ovi';
import type { ItemCategory } from '../items';

/** One wear log for the viewed month (the calendar + recap read from these). */
export interface WornLog {
  id: string;
  wornOn: string;
  outfitId: string | null;
  itemIds: string[];
  weather: Weather | null;
  note: string | null;
}

/** An owned piece referenced by the month's logs, with its resolved cutout URL. */
export interface WornItem {
  id: string;
  name: string;
  category: ItemCategory;
  imageUrl: string | null;
  purchasePrice: string | null;
}

/** The full `GET /api/wear-logs` payload for a month. */
export interface WornMonthData {
  logs: WornLog[];
  items: WornItem[];
}
