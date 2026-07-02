/**
 * @era/core — shared domain model for the Era virtual wardrobe.
 */

export {
  serverEnvSchema,
  webClientEnvSchema,
  mobileClientEnvSchema,
  loadServerEnv,
  loadWebClientEnv,
  loadMobileClientEnv,
} from './env.ts';
export type { ServerEnv, WebClientEnv, MobileClientEnv } from './env.ts';

// Authorization — EVERY API route handler must use these guards. See authz.ts.
export {
  AuthzError,
  requireUser,
  ownerOnly,
  publicReadable,
  canInsertFollow,
  canInsertAiEvent,
  canInsertWaitlist,
} from './authz.ts';
export type { AuthContext, AuthzErrorCode, VisibilityResource } from './authz.ts';

// Persistence type contract, re-exported type-only from @era/db.
export type * from './db-types.ts';

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
