/**
 * Shapes for the closet gallery surface.
 *
 * `GalleryItem` is exactly what `GET /api/items` returns per row: every column
 * on the items table plus the resolved `displayUrl` (see the items route) and
 * the correlated `wearCount`. It extends the shared `ItemWithDisplay` with the
 * provenance/price/wear fields the gallery reads but the add-flow type omits.
 * Kept local so the gallery stays decoupled from the concurrently-evolving
 * items type.
 */
import type { ItemWithDisplay } from '../items';

export interface GalleryItem extends ItemWithDisplay {
  /** Where the piece entered the closet: 'photo' | 'link' | 'email_import' | … */
  source: string;
  /** Numeric column — Postgres numeric surfaces as a string (or null). */
  purchasePrice: string | null;
  /** ISO currency code or symbol paired with `purchasePrice` (or null). */
  currency: string | null;
  /** How many of the owner's wear logs reference this item (0 until logging ships). */
  wearCount: number;
}
