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
  canInsertSavedProduct,
  canDeleteSavedProduct,
  canReadSavedProduct,
  canReadNotificationPreferences,
  canUpsertNotificationPreferences,
  canInsertPushToken,
  canDeletePushToken,
  canReadInAppNotification,
  canUpdateInAppNotification,
  canReadReceiptInboxToken,
  canInsertReceiptInboxToken,
  canRevokeReceiptInboxToken,
} from './authz.ts';
export type { AuthContext, AuthzErrorCode, VisibilityResource } from './authz.ts';

// Platform-free auth API contract — the single surface both web and mobile call
// into for sign-in / sign-out, plus the shared session shape. See auth-api.ts.
export { createEraAuthApi } from './auth-api.ts';
export type { AuthSession, EraAuthApi, AuthClientLike, SessionState, UseSession } from './auth-api.ts';

// Object storage — server-only R2 access. Presigning is always behind an authz
// guard; clients never hold credentials. See storage.ts.
export {
  assetKey,
  storageConfigFromEnv,
  createStorageClient,
  requestUploadUrl,
  getAssetUrl,
  deleteUserObjects,
} from './storage.ts';
export type { AssetBucket, StorageConfig, StorageClient } from './storage.ts';

// AI usage limits + spend estimation — server-side config the metered routes
// (ovi-chat, process-item, derive-style-profile, rank-products) gate and price
// against. Reads optional env overrides, so it lives on the server-tainted
// barrel. See ai-limits.ts.
export {
  aiDailyLimit,
  estimateCostUsd,
  aiKillSwitchEngaged,
  aiGlobalDailyUsdCap,
  globalSpendAllows,
  readGlobalAiGate,
} from './ai-limits.ts';
export type { AiRoute, UsageCheck, GlobalAiGate } from './ai-limits.ts';

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
