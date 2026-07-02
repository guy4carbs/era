/**
 * @era/core — shared domain model for the Era virtual wardrobe.
 */

export type Category = 'top' | 'bottom' | 'outerwear' | 'shoes' | 'accessory';

export type Season = 'spring' | 'summer' | 'autumn' | 'winter';

export interface WardrobeItem {
  readonly id: string;
  readonly name: string;
  readonly category: Category;
  readonly color: string;
  readonly seasons: readonly Season[];
}

/**
 * Produce a short human-readable description of a wardrobe item.
 * Pure — no side effects.
 */
export function describeItem(item: WardrobeItem): string {
  const seasons = item.seasons.length > 0 ? item.seasons.join(', ') : 'any season';
  return `${item.name} — a ${item.color} ${item.category} for ${seasons}`;
}
