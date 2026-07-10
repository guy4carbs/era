/**
 * Era domain schema.
 *
 * Domain tables use uuid primary keys (defaultRandom) and timestamptz-mode
 * timestamps. Every user_id is a text column referencing the Better Auth
 * `user.id` with ON DELETE CASCADE, so deleting a user tears down their data.
 */
import { sql } from 'drizzle-orm';
import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  real,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

import { aiEventKind, itemCategory, itemSource } from './enums.ts';
import { user } from './auth.ts';

export const profiles = pgTable('profiles', {
  // 1:1 with Better Auth user — the user id is the primary key.
  userId: text('user_id')
    .primaryKey()
    .references(() => user.id, { onDelete: 'cascade' }),
  username: text('username').notNull().unique(),
  displayName: text('display_name'),
  avatarUrl: text('avatar_url'),
  isPrivate: boolean('is_private').notNull().default(true),
  // Stamped the first (and only) time the welcome email is sent, so the send
  // path can skip anyone who already got it. Null until the welcome fires.
  welcomeEmailSentAt: timestamp('welcome_email_sent_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const styleProfiles = pgTable('style_profiles', {
  id: uuid('id').primaryKey().defaultRandom(),
  // One style profile per user.
  userId: text('user_id')
    .notNull()
    .unique()
    .references(() => user.id, { onDelete: 'cascade' }),
  archetype: text('archetype'),
  palette: jsonb('palette'),
  quizAnswers: jsonb('quiz_answers'),
  // Reserved for future embedding-based taste matching.
  tasteVector: jsonb('taste_vector'),
  // Repo updated_at pattern: DB default now() on insert, and $onUpdate stamps a
  // fresh value on every Drizzle update so writers never forget to touch it.
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const items = pgTable(
  'items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    category: itemCategory('category').notNull(),
    name: text('name').notNull(),
    brand: text('brand'),
    colorPrimary: text('color_primary'),
    colors: jsonb('colors'),
    pattern: text('pattern'),
    imageRawPath: text('image_raw_path'),
    imageCutoutPath: text('image_cutout_path'),
    source: itemSource('source').notNull(),
    purchasePrice: numeric('purchase_price'),
    currency: text('currency'),
    tagsConfirmed: boolean('tags_confirmed').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    archived: boolean('archived').notNull().default(false),
  },
  (table) => [index('items_user_id_category_idx').on(table.userId, table.category)],
);

export const outfits = pgTable(
  'outfits',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    name: text('name'),
    occasion: text('occasion'),
    isAiGenerated: boolean('is_ai_generated').notNull().default(false),
    coverImagePath: text('cover_image_path'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('outfits_user_id_idx').on(table.userId)],
);

export const outfitItems = pgTable(
  'outfit_items',
  {
    outfitId: uuid('outfit_id')
      .notNull()
      .references(() => outfits.id, { onDelete: 'cascade' }),
    itemId: uuid('item_id')
      .notNull()
      .references(() => items.id, { onDelete: 'cascade' }),
    layerOrder: integer('layer_order').notNull().default(0),
    // Canvas transform, persisted so an outfit reopens with its exact
    // arrangement. Position is normalized 0..1 (center-relative) rather than
    // pixels so web and mobile render the same layout on different canvas
    // sizes — each renderer multiplies by its own canvas dimensions.
    posX: real('pos_x').notNull().default(0.5), // 0.5 = horizontal center
    posY: real('pos_y').notNull().default(0.5), // 0.5 = vertical center
    scale: real('scale').notNull().default(1), // size multiplier
    rotation: real('rotation').notNull().default(0), // degrees
  },
  (table) => [primaryKey({ columns: [table.outfitId, table.itemId] })],
);

export const eras = pgTable(
  'eras',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    description: text('description'),
    coverImagePath: text('cover_image_path'),
    season: text('season'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('eras_user_id_idx').on(table.userId)],
);

export const eraOutfits = pgTable(
  'era_outfits',
  {
    eraId: uuid('era_id')
      .notNull()
      .references(() => eras.id, { onDelete: 'cascade' }),
    outfitId: uuid('outfit_id')
      .notNull()
      .references(() => outfits.id, { onDelete: 'cascade' }),
  },
  (table) => [primaryKey({ columns: [table.eraId, table.outfitId] })],
);

export const wearLogs = pgTable(
  'wear_logs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    outfitId: uuid('outfit_id').references(() => outfits.id, { onDelete: 'set null' }),
    itemIds: uuid('item_ids').array(),
    wornOn: date('worn_on').notNull(),
    weather: jsonb('weather'),
    note: text('note'),
  },
  (table) => [index('wear_logs_user_id_worn_on_idx').on(table.userId, table.wornOn)],
);

export const follows = pgTable(
  'follows',
  {
    followerId: text('follower_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    followeeId: text('followee_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // The composite PK is the unique follower/followee pair.
    primaryKey({ columns: [table.followerId, table.followeeId] }),
    index('follows_follower_id_idx').on(table.followerId),
    index('follows_followee_id_idx').on(table.followeeId),
  ],
);

export const aiEvents = pgTable(
  'ai_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    kind: aiEventKind('kind').notNull(),
    payload: jsonb('payload'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('ai_events_user_id_idx').on(table.userId)],
);

export const aiUsage = pgTable(
  'ai_usage',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    // The AI surface this call hit — 'ovi-chat' | 'process-item' |
    // 'derive-style-profile'. Stored as text; the app validates the value.
    route: text('route').notNull(),
    // The model, input/output tokens, and cost are only populated when an LLM
    // actually ran. Deterministic/dormant paths log a row with a null model and
    // costUsd 0 so they still count against the per-user daily rate limit.
    model: text('model'),
    inputTokens: integer('input_tokens'),
    outputTokens: integer('output_tokens'),
    costUsd: numeric('cost_usd').notNull().default('0'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // Daily spend rollup: SUM(cost_usd) WHERE user_id = ? AND created_at >= day.
    index('ai_usage_user_id_created_at_idx').on(table.userId, table.createdAt),
    // Rate-limit counter: COUNT(*) WHERE user_id = ? AND route = ? AND
    // created_at >= start-of-UTC-day.
    index('ai_usage_user_id_route_created_at_idx').on(table.userId, table.route, table.createdAt),
  ],
);

export const savedProducts = pgTable(
  'saved_products',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    // Shop products come from an external affiliate feed with no table to FK to,
    // so a saved row is a denormalized snapshot of the ShopProduct at save time.
    productId: text('product_id').notNull(), // external ShopProduct.id (stable feed key)
    retailer: text('retailer').notNull(),
    title: text('title').notNull(),
    brand: text('brand'),
    category: itemCategory('category'), // ShopProduct.category IS an ItemCategory
    imageUrl: text('image_url'),
    productUrl: text('product_url').notNull(),
    affiliateUrl: text('affiliate_url').notNull(),
    currency: text('currency').notNull(),
    // Price captured at save time — the baseline for future price-drop signals.
    priceSnapshot: numeric('price_snapshot').notNull(),
    // Price-watch tracking (Phase 2B). Both null until the first price check runs.
    // Stored as integer cents (not numeric like priceSnapshot) so drop-comparison
    // math against lastPriceCents is exact integer arithmetic, no float rounding.
    lastPriceCents: integer('last_price_cents'),
    lastCheckedAt: timestamp('last_checked_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // Idempotent add/remove: one saved row per (user, external product).
    unique('saved_products_user_id_product_id_key').on(table.userId, table.productId),
    index('saved_products_user_id_idx').on(table.userId),
  ],
);

export const notificationPreferences = pgTable('notification_preferences', {
  // 1:1 with Better Auth user — the user id is the primary key (like profiles).
  userId: text('user_id')
    .primaryKey()
    .references(() => user.id, { onDelete: 'cascade' }),
  // Everything is OPT-IN: all channels default false. A user has to explicitly
  // turn each one on. No price alert is ever sent to a user who has not enabled it.
  priceAlertsEnabled: boolean('price_alerts_enabled').notNull().default(false),
  emailAlerts: boolean('email_alerts').notNull().default(false),
  pushAlerts: boolean('push_alerts').notNull().default(false),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const pushTokens = pgTable(
  'push_tokens',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    token: text('token').notNull(),
    // Device platform — 'ios' | 'android'. Stored as text; the app validates it.
    platform: text('platform').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // One registration per (user, token) — re-registering the same device is idempotent.
    unique('push_tokens_user_id_token_key').on(table.userId, table.token),
    index('push_tokens_user_id_idx').on(table.userId),
  ],
);

export const inAppNotifications = pgTable(
  'in_app_notifications',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    // Notification type — e.g. 'price_drop'. Stored as text; the app validates it.
    kind: text('kind').notNull(),
    // Denormalized card contents, e.g. { savedProductId, productId, retailer,
    // title, oldPriceCents, newPriceCents, currency, imageUrl, affiliateUrl }.
    payload: jsonb('payload').notNull(),
    // Null until the user opens/dismisses the card.
    readAt: timestamp('read_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // Feed query: user's notifications newest-first.
    index('in_app_notifications_user_id_created_at_idx').on(table.userId, table.createdAt),
  ],
);

export const waitlist = pgTable('waitlist', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull().unique(),
  referralCode: text('referral_code'),
  referredBy: text('referred_by'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const emailSuppressions = pgTable('email_suppressions', {
  id: uuid('id').primaryKey().defaultRandom(),
  // Keyed by email, NOT user_id — hard bounces and complaints must suppress
  // non-users too (e.g. waitlist signups). The writer lowercase-normalizes the
  // value before insert; the column just guarantees uniqueness. The send path
  // checks this table before every email; the Resend webhook writes to it.
  email: text('email').notNull().unique(),
  // Why the address is suppressed — 'bounced' | 'complained' | 'manual'.
  // Stored as text; the app validates the value.
  reason: text('reason').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const receiptInboxTokens = pgTable(
  'receipt_inbox_tokens',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    // The bare token that identifies the account for inbound receipt mail. The
    // user's receiving address is `u_<token>@in.era.style`; the `u_` prefix is a
    // routing artifact composed/stripped by app code (@era/core), so this column
    // stores ONLY the token. Mail maps to an account by this token, NEVER by
    // matching the sender. Crypto-random 128-bit, lowercase hex (32 chars) —
    // email local-parts are case-insensitive, so the token is generated, stored,
    // and compared in lowercase, making it case-insensitively unique.
    //
    // Globally unique across ALL rows (active AND revoked): a token string is
    // never reused, so the webhook's `WHERE token = ?` lookup always resolves to
    // at most one row and one account, even after rotation.
    token: text('token').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    // Null while the token is active. Rotation SOFT-dies the old row (stamps
    // revoked_at) rather than deleting it, so we keep an audit trail of when an
    // address was retired and can resolve — then explicitly reject — mail that
    // still arrives at a just-rotated address instead of it looking unroutable.
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
  },
  (table) => [
    // Webhook resolution + global no-reuse guarantee: one row per token string,
    // forever, across active and revoked history.
    unique('receipt_inbox_tokens_token_key').on(table.token),
    // Exactly ONE active token per user. Partial unique index on user_id filtered
    // to live rows — also serves the "what's my current address?" lookup
    // (WHERE user_id = ? AND revoked_at IS NULL).
    uniqueIndex('receipt_inbox_tokens_active_user_idx')
      .on(table.userId)
      .where(sql`${table.revokedAt} is null`),
  ],
);

export const inboundEmailEvents = pgTable('inbound_email_events', {
  // Resend's `data.email_id` — the stable per-inbound-message id. It IS the
  // primary key: inbound webhooks are at-least-once (Resend retries on a
  // 5s→10h schedule), so the import must be durably idempotent or a replay
  // duplicates draft items. The webhook inserts this row with
  // onConflictDoNothing and skips processing when the row already existed —
  // that single insert is the whole dedupe gate. No extra indexes: every
  // lookup is by the primary key.
  emailId: text('email_id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  processedAt: timestamp('processed_at', { withTimezone: true }).notNull().defaultNow(),
});
