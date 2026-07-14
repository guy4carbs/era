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

// Reserved usernames — the one list both the username-claim path and the
// public-profile loader consult so a profile can never shadow an app route. See
// reserved-usernames.ts.
export { RESERVED_USERNAMES, isReservedUsername } from './reserved-usernames.ts';

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

// Era+ subscriptions — pure entitlement logic + the RevenueCat event mapper.
// Client-safe (no server-only deps); web/mobile client code imports isPlus +
// isEraPlusEnabled from the `@era/core/plus` subpath to avoid this server-tainted
// barrel. Re-exported here for server callers. See plus.ts.
export {
  isEraPlusEnabled,
  isPlus,
  parseRevenueCatEvent,
  applyRevenueCatEvent,
} from './plus.ts';
export type {
  PlusSubscriptionState,
  SubscriptionStore,
  SubscriptionEnvironment,
  RevenueCatEventType,
  RevenueCatEvent,
  SubscriptionUpsert,
} from './plus.ts';

// Feed — the social outfit-inspo feed. All pure and client-safe (no server-only
// deps); web/mobile client code imports the wire contract, the ranker, closet
// matching, and the flag from the `@era/core/feed`, `/feed-ranking`,
// `/outfit-matching`, and `/feed-flags` subpaths to avoid this server-tainted
// barrel. Re-exported here for server callers (feed-server assembles the payload
// and constructs the ranker). See feed.ts, feed-ranking.ts, outfit-matching.ts,
// feed-flags.ts.
export { REPORT_REASONS, isReportReason, FEED_PAGE_WINDOW } from './feed.ts';
export type {
  FeedPostType,
  FeedPostCreator,
  FeedPostViewerState,
  FeedPostPayload,
  FeedPage,
  ReportReason,
} from './feed.ts';
export { createRecencyFollowsEngagementRanker } from './feed-ranking.ts';
export type { FeedCandidate, ViewerContext, RankedCandidate, FeedRanker } from './feed-ranking.ts';
export { matchOutfitToCloset } from './outfit-matching.ts';
export type { ScoredClosetMatch, SlotMatch } from './outfit-matching.ts';
export { isEraFeedEnabled } from './feed-flags.ts';

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
