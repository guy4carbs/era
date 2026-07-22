import type { OviItem } from '@era/core/ovi';

/**
 * The closet fields Ovi's composers reason over. A `GalleryItem` (and the item-
 * detail row) already carry these — this is the intersection, kept narrow so the
 * mapper stays decoupled from either surface's fuller row type.
 */
export interface OviItemSource {
  readonly id: string;
  readonly category: string;
  readonly colors: readonly string[] | null;
  readonly pattern: string | null;
  readonly brand: string | null;
}

/**
 * Map the closet's item rows to the image-free {@link OviItem} shape the ambient
 * suggestion composers (`suggestForCloset` / `suggestForItem` / `suggestForDesign`)
 * reason over. Null colours degrade to an empty list — the composers never invent.
 */
export function toOviItems(items: readonly OviItemSource[]): OviItem[] {
  return items.map((item) => ({
    id: item.id,
    category: item.category,
    colors: item.colors ?? [],
    pattern: item.pattern,
    brand: item.brand,
  }));
}
