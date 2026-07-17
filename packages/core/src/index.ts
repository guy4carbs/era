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
  deleteObjectsUnderPrefix,
  countObjectsUnderPrefix,
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

// Turnaround views — flag-gated multi-angle renders of an item cutout, generated
// by an image API and QA'd by Claude vision. All pure and client-safe (no
// server-only deps); web/mobile client code imports the wire contract + QA gate
// from the `@era/core/turnaround` subpath and the flags from
// `@era/core/turnaround-flags` to avoid this server-tainted barrel. Re-exported
// here for server callers (the route assembles the payload, drives generation
// from the prompts, and scores each QA verdict). See turnaround.ts,
// turnaround-flags.ts.
export {
  TURNAROUND_ANGLES,
  TURNAROUND_PROMPT_PREAMBLE,
  TURNAROUND_ANGLE_INSTRUCTIONS,
  anglePrompt,
  isRenderAcceptable,
} from './turnaround.ts';
export type {
  TurnaroundAngle,
  TurnaroundRender,
  TurnaroundStatus,
  TurnaroundState,
  TurnaroundVerdict,
} from './turnaround.ts';
export {
  isEraTurnaroundEnabled,
  enabledTurnaroundCategories,
  isTurnaroundCategoryEnabled,
} from './turnaround-flags.ts';

// Virtual try-on — the flag-gated Era+ avatar surface. A user builds a consented
// avatar from their own photos and renders a saved outfit onto it. All pure and
// client-safe (no server-only deps); web/mobile client code imports the wire
// contract + chain planner from the `@era/core/tryon` subpath and the flag from
// `@era/core/tryon-flags` to avoid this server-tainted barrel. Re-exported here for
// server callers (the routes drive chain execution from planTryonChain and key
// render staleness off itemsSignature). See tryon.ts, tryon-flags.ts.
export { TRYON_CATEGORIES, planTryonChain, itemsSignature } from './tryon.ts';
export type {
  TryonCategory,
  TryonInputItem,
  GarmentStep,
  AvatarStatus,
  AvatarState,
  TryonStatus,
  TryonState,
} from './tryon.ts';
export { isEraTryonEnabled } from './tryon-flags.ts';

// In-flow checkout — the flag-gated cross-store cart + single-checkout surface,
// powered by Rye for operator-sandbox-verified retailers (everyone else keeps the
// affiliate tap-out). All pure and client-safe (no server-only deps); web/mobile
// client code imports the contract + cart math from the `@era/core/checkout` subpath
// and the flag from `@era/core/checkout-flags` to avoid this server-tainted barrel.
// Re-exported here for server callers (the routes drive createIntent/confirmIntent
// and persist per-store outcomes). The allowlist is the honesty control and the copy
// never claims a universal checkout. See checkout.ts, checkout-flags.ts.
export {
  parseCheckoutRetailers,
  checkoutSupportFor,
  subunitsToCents,
  groupCartByRetailer,
  combineOffers,
  sizeKindForCategory,
  createFixtureCheckoutProvider,
} from './checkout.ts';
export type {
  CheckoutSupport,
  CheckoutIntentState,
  CheckoutBuyer,
  CheckoutOffer,
  CheckoutIntent,
  CreateCheckoutIntentInput,
  CheckoutPayment,
  CheckoutProvider,
  CheckoutCartItem,
  CartRetailerGroup,
  RetailerOffer,
  CombinedOfferLine,
  CombinedOffer,
  SizeKind,
} from './checkout.ts';
export { isEraCheckoutEnabled } from './checkout-flags.ts';

// Model harness — the reusable, ships-DARK scaffolding for a future custom-ML phase.
// Three swappable seams behind stable interfaces (the tagger, the outfit ranker, and
// A/B variant selection) plus an OFFLINE EVAL HARNESS that encodes "promote only on
// measured wins" as testable code. All pure and client-safe (no server-only deps); the
// network-bound baseline providers (Claude-vision tagger) live server-side against these
// same interfaces. Web/mobile client code imports from the `@era/core/tagging`,
// `/outfit-ranking`, `/model-flags`, and `/model-eval` subpaths to avoid this
// server-tainted barrel. Re-exported here for server callers (routes construct the
// selected provider at the seam's one construction site and run the eval over the
// `ai_events` corpus). Baseline behavior is unchanged — no seam is wired live yet. See
// tagging.ts, outfit-ranking.ts, model-flags.ts, model-eval.ts.
export { createDeterministicTaggingProvider } from './tagging.ts';
export type { TagPrediction, TaggingInput, TaggingProvider } from './tagging.ts';
export { createHeuristicOutfitRanker } from './outfit-ranking.ts';
export type { OutfitCandidate, OutfitRankContext, RankedOutfit, OutfitRanker } from './outfit-ranking.ts';
export { parseModelVariant } from './model-flags.ts';
export type { ModelVariant } from './model-flags.ts';
export {
  splitHeldOut,
  runTagger,
  evaluateTagger,
  evaluateRanker,
  promotionVerdict,
  DEFAULT_MIN_MARGIN,
  DEFAULT_MIN_TEST_COUNT,
} from './model-eval.ts';
export type {
  TagCorrectionExample,
  AcceptRejectExample,
  HeldOutSplit,
  TaggerMetrics,
  TagScoredPair,
  RankerMetrics,
  VerdictMetric,
  PromotionOptions,
  PromotionReason,
  PromotionVerdict,
} from './model-eval.ts';

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
