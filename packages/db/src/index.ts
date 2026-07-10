/**
 * @era/db — Drizzle schema, client, and inferred row types for Era.
 */
import { account, session, user, verification } from './schema/auth.ts';
import { aiEventKind, itemCategory, itemSource } from './schema/enums.ts';
import {
  aiEvents,
  aiUsage,
  emailSuppressions,
  eraOutfits,
  eras,
  follows,
  inAppNotifications,
  inboundEmailEvents,
  items,
  notificationPreferences,
  outfitItems,
  outfits,
  profiles,
  pushTokens,
  receiptInboxTokens,
  savedProducts,
  styleProfiles,
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

// Enum value unions.
export type ItemCategory = (typeof itemCategory.enumValues)[number];
export type ItemSource = (typeof itemSource.enumValues)[number];
export type AiEventKind = (typeof aiEventKind.enumValues)[number];
