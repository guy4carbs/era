/**
 * @era/db — Drizzle schema, client, and inferred row types for Era.
 */
import { account, session, user, verification } from './schema/auth.ts';
import {
  aiEventKind,
  feedReportReason,
  feedReportStatus,
  itemCategory,
  itemSource,
  turnaroundAngle,
  turnaroundJobStatus,
} from './schema/enums.ts';
import {
  aiEvents,
  aiUsage,
  emailSuppressions,
  eraOutfits,
  eras,
  feedPosts,
  feedReports,
  follows,
  inAppNotifications,
  inboundEmailEvents,
  itemAngleRenders,
  items,
  itemTurnaroundJobs,
  notificationPreferences,
  outfitItems,
  outfits,
  postLikes,
  postSaves,
  profiles,
  pushTokens,
  receiptInboxTokens,
  savedProducts,
  styleProfiles,
  subscriptions,
  userBlocks,
  waitlist,
  wearLogs,
} from './schema/app.ts';

export {
  // Better Auth tables
  user,
  session,
  account,
  verification,
  // Enums
  itemCategory,
  itemSource,
  aiEventKind,
  feedReportReason,
  feedReportStatus,
  turnaroundAngle,
  turnaroundJobStatus,
  // Domain tables
  profiles,
  styleProfiles,
  items,
  outfits,
  outfitItems,
  eras,
  eraOutfits,
  wearLogs,
  follows,
  aiEvents,
  aiUsage,
  savedProducts,
  notificationPreferences,
  pushTokens,
  inAppNotifications,
  waitlist,
  emailSuppressions,
  receiptInboxTokens,
  inboundEmailEvents,
  subscriptions,
  feedPosts,
  postLikes,
  postSaves,
  userBlocks,
  feedReports,
  itemTurnaroundJobs,
  itemAngleRenders,
};

export { createDbClient } from './client.ts';
export type { DbClient } from './client.ts';

// Inferred row types — `X` for selects, `NewX` for inserts.
export type AuthUser = typeof user.$inferSelect;
export type NewAuthUser = typeof user.$inferInsert;

export type Profile = typeof profiles.$inferSelect;
export type NewProfile = typeof profiles.$inferInsert;

export type StyleProfile = typeof styleProfiles.$inferSelect;
export type NewStyleProfile = typeof styleProfiles.$inferInsert;

export type Item = typeof items.$inferSelect;
export type NewItem = typeof items.$inferInsert;

export type Outfit = typeof outfits.$inferSelect;
export type NewOutfit = typeof outfits.$inferInsert;

export type OutfitItem = typeof outfitItems.$inferSelect;
export type NewOutfitItem = typeof outfitItems.$inferInsert;

export type Era = typeof eras.$inferSelect;
export type NewEra = typeof eras.$inferInsert;

export type EraOutfit = typeof eraOutfits.$inferSelect;
export type NewEraOutfit = typeof eraOutfits.$inferInsert;

export type WearLog = typeof wearLogs.$inferSelect;
export type NewWearLog = typeof wearLogs.$inferInsert;

export type Follow = typeof follows.$inferSelect;
export type NewFollow = typeof follows.$inferInsert;

export type AiEvent = typeof aiEvents.$inferSelect;
export type NewAiEvent = typeof aiEvents.$inferInsert;

export type AiUsage = typeof aiUsage.$inferSelect;
export type NewAiUsage = typeof aiUsage.$inferInsert;

export type SavedProduct = typeof savedProducts.$inferSelect;
export type NewSavedProduct = typeof savedProducts.$inferInsert;

export type NotificationPreference = typeof notificationPreferences.$inferSelect;
export type NewNotificationPreference = typeof notificationPreferences.$inferInsert;

export type PushToken = typeof pushTokens.$inferSelect;
export type NewPushToken = typeof pushTokens.$inferInsert;

export type InAppNotification = typeof inAppNotifications.$inferSelect;
export type NewInAppNotification = typeof inAppNotifications.$inferInsert;

export type WaitlistEntry = typeof waitlist.$inferSelect;
export type NewWaitlistEntry = typeof waitlist.$inferInsert;

export type EmailSuppression = typeof emailSuppressions.$inferSelect;
export type NewEmailSuppression = typeof emailSuppressions.$inferInsert;

export type ReceiptInboxToken = typeof receiptInboxTokens.$inferSelect;
export type NewReceiptInboxToken = typeof receiptInboxTokens.$inferInsert;

export type InboundEmailEvent = typeof inboundEmailEvents.$inferSelect;
export type NewInboundEmailEvent = typeof inboundEmailEvents.$inferInsert;

export type Subscription = typeof subscriptions.$inferSelect;
export type NewSubscription = typeof subscriptions.$inferInsert;

export type FeedPost = typeof feedPosts.$inferSelect;
export type NewFeedPost = typeof feedPosts.$inferInsert;

export type PostLike = typeof postLikes.$inferSelect;
export type NewPostLike = typeof postLikes.$inferInsert;

export type PostSave = typeof postSaves.$inferSelect;
export type NewPostSave = typeof postSaves.$inferInsert;

export type UserBlock = typeof userBlocks.$inferSelect;
export type NewUserBlock = typeof userBlocks.$inferInsert;

export type FeedReport = typeof feedReports.$inferSelect;
export type NewFeedReport = typeof feedReports.$inferInsert;

export type ItemTurnaroundJob = typeof itemTurnaroundJobs.$inferSelect;
export type NewItemTurnaroundJob = typeof itemTurnaroundJobs.$inferInsert;

export type ItemAngleRender = typeof itemAngleRenders.$inferSelect;
export type NewItemAngleRender = typeof itemAngleRenders.$inferInsert;

// Enum value unions.
export type ItemCategory = (typeof itemCategory.enumValues)[number];
export type ItemSource = (typeof itemSource.enumValues)[number];
export type AiEventKind = (typeof aiEventKind.enumValues)[number];
export type FeedReportReason = (typeof feedReportReason.enumValues)[number];
export type FeedReportStatus = (typeof feedReportStatus.enumValues)[number];
export type TurnaroundAngle = (typeof turnaroundAngle.enumValues)[number];
export type TurnaroundJobStatus = (typeof turnaroundJobStatus.enumValues)[number];
