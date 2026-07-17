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
  check,
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

import {
  aiEventKind,
  avatarStatus,
  feedReportReason,
  feedReportStatus,
  itemCategory,
  itemSource,
  tryonStatus,
  turnaroundAngle,
  turnaroundJobStatus,
} from './enums.ts';
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

export const subscriptions = pgTable('subscriptions', {
  // 1:1 with Better Auth user — the user id is the primary key. This table is a
  // cache of RevenueCat entitlement state: rows are written ONLY by the
  // RevenueCat webhook handler (stripeCustomerId is the one exception — written
  // at Stripe checkout). The isPlus() read path is a single PK lookup, so no
  // secondary indexes are needed.
  userId: text('user_id')
    .primaryKey()
    .references(() => user.id, { onDelete: 'cascade' }),
  // The RevenueCat app user id. Equals our userId by contract, but we store what
  // RC actually sends rather than assuming.
  rcAppUserId: text('rc_app_user_id').notNull(),
  // The purchased product — 'era_plus_monthly' | 'era_plus_annual'. Stored as
  // text (not a pg enum) because the product catalog grows; the app validates it.
  productId: text('product_id').notNull(),
  // Purchase store — 'app_store' | 'stripe' | 'play_store' | 'promotional'.
  // Stored as text; the app validates the value.
  store: text('store').notNull(),
  // RevenueCat environment — 'sandbox' | 'production'. Stored as text; the app
  // validates the value.
  environment: text('environment').notNull(),
  purchasedAt: timestamp('purchased_at', { withTimezone: true }).notNull(),
  // Null means a non-expiring entitlement (promotional/lifetime). The entitlement
  // is active while expiresAt IS NULL OR expiresAt > now().
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  willRenew: boolean('will_renew').notNull().default(false),
  // Stamped when RC reports the user turned off auto-renew; null otherwise.
  unsubscribeDetectedAt: timestamp('unsubscribe_detected_at', { withTimezone: true }),
  // Stamped when RC reports a billing issue (grace period); null otherwise.
  billingIssuesDetectedAt: timestamp('billing_issues_detected_at', { withTimezone: true }),
  // Written by the web checkout route (NOT the webhook) so the Stripe customer
  // portal can be opened later. Null for App Store / Play Store / promotional.
  stripeCustomerId: text('stripe_customer_id'),
  // RevenueCat event id of the last applied event — the idempotency key.
  lastEventId: text('last_event_id').notNull(),
  // RC event timestamp of the last applied event. The webhook ignores any event
  // older than this, so out-of-order deliveries never regress the cached state.
  lastEventAt: timestamp('last_event_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

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

export const feedPosts = pgTable(
  'feed_posts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    // A post shares exactly one subject — either an outfit or an era, never
    // both and never neither (enforced by the num_nonnulls CHECK below). The
    // subject FK cascades: deleting the outfit/era tears down its post, and the
    // post's engagement (likes/saves) cascades from there.
    outfitId: uuid('outfit_id').references(() => outfits.id, { onDelete: 'cascade' }),
    eraId: uuid('era_id').references(() => eras.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // Exactly one subject per post — outfit XOR era.
    check('feed_posts_one_subject', sql`num_nonnulls(${table.outfitId}, ${table.eraId}) = 1`),
    // One LIVE post per subject. Partial unique indexes (filtered to non-null)
    // so unsharing then re-sharing an outfit/era mints a fresh post with fresh
    // engagement, while a subject can never be double-posted at once.
    uniqueIndex('feed_posts_outfit_id_key')
      .on(table.outfitId)
      .where(sql`${table.outfitId} is not null`),
    uniqueIndex('feed_posts_era_id_key')
      .on(table.eraId)
      .where(sql`${table.eraId} is not null`),
    // Keyset pagination over the global stream, ordered (created_at, id) desc.
    index('feed_posts_created_at_id_idx').on(table.createdAt, table.id),
    // "My posts" listing + the per-user daily post cap COUNT.
    index('feed_posts_user_id_created_at_idx').on(table.userId, table.createdAt),
  ],
);

export const postLikes = pgTable(
  'post_likes',
  {
    postId: uuid('post_id')
      .notNull()
      .references(() => feedPosts.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // The composite PK is the unique (post, liker) pair — it also IS the index
    // that serves the per-post live COUNT(*). No denormalized counter column:
    // counts drift without transactions (neon-http), so they stay live.
    primaryKey({ columns: [table.postId, table.userId] }),
    index('post_likes_user_id_created_at_idx').on(table.userId, table.createdAt),
  ],
);

export const postSaves = pgTable(
  'post_saves',
  {
    postId: uuid('post_id')
      .notNull()
      .references(() => feedPosts.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // Identical shape to post_likes: composite PK is the unique (post, saver)
    // pair and the per-post live COUNT(*) index. Counts stay live, not cached.
    primaryKey({ columns: [table.postId, table.userId] }),
    index('post_saves_user_id_created_at_idx').on(table.userId, table.createdAt),
  ],
);

export const userBlocks = pgTable(
  'user_blocks',
  {
    blockerId: text('blocker_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    blockedId: text('blocked_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // Composite PK is the unique (blocker, blocked) directed edge. A block is
    // bidirectional invisibility, so filters check BOTH directions: the PK
    // covers the forward lookup (who I blocked); the blocked_id index covers
    // the reverse (who blocked me).
    primaryKey({ columns: [table.blockerId, table.blockedId] }),
    index('user_blocks_blocked_id_idx').on(table.blockedId),
  ],
);

export const feedReports = pgTable(
  'feed_reports',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    reporterId: text('reporter_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    // The reported user is denormalized and NOT NULL — captured at report time
    // so the moderation row survives the post being deleted (postId goes null
    // via ON DELETE SET NULL, but the subject of the report is still known).
    reportedUserId: text('reported_user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    // Nullable, ON DELETE SET NULL: a report can target a profile (no post), and
    // deleting a reported post must not erase the report — it detaches instead.
    postId: uuid('post_id').references(() => feedPosts.id, { onDelete: 'set null' }),
    reason: feedReportReason('reason').notNull(),
    // Free-text elaboration, app-capped at 500 chars. Null when the reporter
    // gave only a reason.
    detail: text('detail'),
    status: feedReportStatus('status').notNull().default('pending'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    // Stamped when a moderator actions the report (reviewed/dismissed); null
    // while pending.
    reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
  },
  (table) => [
    // Moderation queue: pending reports oldest-first.
    index('feed_reports_status_created_at_idx').on(table.status, table.createdAt),
    // Per-reporter daily cap COUNT.
    index('feed_reports_reporter_id_created_at_idx').on(table.reporterId, table.createdAt),
  ],
);

export const itemTurnaroundJobs = pgTable(
  'item_turnaround_jobs',
  {
    // One generation job per item — the item id IS the primary key, so the
    // insert-onConflictDoNothing that starts a job doubles as the idempotency
    // claim. The neon-http driver has no transactions, so a claimed row (not a
    // transaction) is what guards against a second concurrent generation.
    itemId: uuid('item_id')
      .primaryKey()
      .references(() => items.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    status: turnaroundJobStatus('status').notNull().default('running'),
    // Failure detail for ops; null while running or on success.
    error: text('error'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    // Per-user daily cap COUNT over the user's own jobs.
    index('item_turnaround_jobs_user_id_created_at_idx').on(table.userId, table.createdAt),
  ],
);

export const avatars = pgTable('avatars', {
  // One avatar per user — the user id IS the primary key, so the
  // insert-onConflictDoNothing that starts avatar creation doubles as the
  // idempotency claim. The neon-http driver has no transactions, so a claimed
  // row (not a transaction) is what guards against a second concurrent
  // creation — same idiom as item_turnaround_jobs.
  userId: text('user_id')
    .primaryKey()
    .references(() => user.id, { onDelete: 'cascade' }),
  status: avatarStatus('status').notNull().default('creating'),
  // Explicit opt-in consent. The row's mere existence ⟹ the user consented;
  // this is the server-side timestamp of that consent, stamped when the claim
  // row is inserted (never from client input). Deleting the avatar deletes
  // this consent record along with it — consent lives and dies with the row.
  consentAt: timestamp('consent_at', { withTimezone: true }).notNull(),
  // The try-on person image: avatars-bucket key `${userId}/avatar/{uuid}.png`.
  // Null until Model Creation finishes and the base image lands. This is the
  // ONLY avatar image the try-on pipeline consumes.
  baseImagePath: text('base_image_path'),
  // Transient source-photo keys (`${userId}/avatar-src/…`) used ONCE to build
  // the likeness. The objects are deleted AND this column is NULLED immediately
  // after the base image is ready — the raw user photos are transient by
  // design and are never retained past creation. Null in steady state.
  sourcePhotoPaths: jsonb('source_photo_paths'),
  // The try-on vendor. Text (not a pg enum) — the catalog can grow; the app
  // validates the value.
  vendor: text('vendor').notNull().default('fashn'),
  // Vendor-side model/avatar id — the deletion seam. Passed to the vendor's
  // delete endpoint on avatar deletion (if the DPA confirms one exists).
  vendorModelId: text('vendor_model_id'),
  // Failure detail for ops; null while creating or on success.
  error: text('error'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const outfitTryons = pgTable(
  'outfit_tryons',
  {
    // One live render per outfit — the outfit id IS the primary key, so the
    // insert-onConflictDoNothing that claims a render doubles as the idempotency
    // claim, and the row is both the claim and the cache. No transactions on
    // neon-http; the claimed row guards against a second concurrent render.
    outfitId: uuid('outfit_id')
      .primaryKey()
      .references(() => outfits.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    status: tryonStatus('status').notNull().default('running'),
    // The staleness key: the rendered garments' item uuids, sorted and
    // ':'-joined. A render is stale when this no longer matches the outfit's
    // current garment set. outfits has NO updated_at, and canvas transforms
    // (position/scale/rotation) must NOT invalidate a render — only a change to
    // the actual set of garments does — so the signature keys off the item set,
    // never the outfit row's mtime.
    itemsSignature: text('items_signature').notNull(),
    // Rendered image: `${userId}/tryon/{uuid}.png`. Null unless status complete.
    imagePath: text('image_path'),
    // Chain progress for the in-flight render — garments rendered so far out of
    // the total planned. Both 0 until the chain starts.
    garmentsRendered: integer('garments_rendered').notNull().default(0),
    garmentsTotal: integer('garments_total').notNull().default(0),
    // Failure detail for ops; null while running or on success.
    error: text('error'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    // The user's own renders (listing + any per-user rollup).
    index('outfit_tryons_user_id_idx').on(table.userId),
  ],
);

export const userSizes = pgTable('user_sizes', {
  // 1:1 with Better Auth user — the user id is the primary key (like profiles /
  // notification_preferences). One sizes row per user, upserted at first checkout.
  userId: text('user_id')
    .primaryKey()
    .references(() => user.id, { onDelete: 'cascade' }),
  // Sizes are stored as text and validated app-side against SIZE_OPTIONS (the
  // catalog grows; no pg enum). Each is null until the user fills it in — a size
  // is only prefilled at checkout for categories the user has actually set.
  apparelSize: text('apparel_size'),
  denimSize: text('denim_size'),
  shoeSize: text('shoe_size'),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const shippingAddresses = pgTable('shipping_addresses', {
  // 1:1 with Better Auth user for v1 — the user id is the primary key. The table
  // name is plural because supporting multiple addresses later is an additive
  // change (add an id PK + drop this one), not a rename. PII: owner-only reads,
  // the DELETE route wipes the row, and account deletion cascades it away.
  userId: text('user_id')
    .primaryKey()
    .references(() => user.id, { onDelete: 'cascade' }),
  firstName: text('first_name').notNull(),
  lastName: text('last_name').notNull(),
  // Nullable: phone is optional at the form and the checkout vendor, so we never
  // force it (data minimization). Included in the buyer payload only when present.
  phone: text('phone'),
  address1: text('address1').notNull(),
  // The only optional line — apartment/suite/etc.
  address2: text('address2'),
  city: text('city').notNull(),
  province: text('province').notNull(),
  postalCode: text('postal_code').notNull(),
  // ISO-2 country code, validated app-side.
  country: text('country').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const cartItems = pgTable(
  'cart_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    // Cart products come from the external affiliate feed with no table to FK to,
    // so a cart row is a denormalized snapshot of the ShopProduct at add time —
    // the saved_products precedent.
    productId: text('product_id').notNull(), // external ShopProduct.id (stable feed key)
    retailer: text('retailer').notNull(),
    title: text('title').notNull(),
    brand: text('brand'),
    imageUrl: text('image_url'),
    productUrl: text('product_url').notNull(),
    affiliateUrl: text('affiliate_url').notNull(),
    category: itemCategory('category'), // ShopProduct.category IS an ItemCategory
    // Price captured at add time. Stored as integer cents (not numeric like
    // saved_products.priceSnapshot) so checkout's price-ceiling math is exact
    // integer arithmetic — the lastPriceCents precedent.
    priceSnapshotCents: integer('price_snapshot_cents').notNull(),
    currency: text('currency').notNull(),
    // Selected size (null until picked); validated app-side against SIZE_OPTIONS.
    size: text('size'),
    quantity: integer('quantity').notNull().default(1),
    addedAt: timestamp('added_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // Idempotent add: one cart row per (user, external product). Re-adding the
    // same product is onConflictDoNothing.
    unique('cart_items_user_id_product_id_key').on(table.userId, table.productId),
    index('cart_items_user_id_idx').on(table.userId),
  ],
);

export const orders = pgTable(
  'orders',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    // One batch = one user checkout action. The N sibling orders minted by a
    // single "check out" click share this id; batch status is DERIVED by folding
    // the members (there is no batch table and no cross-order atomicity — the
    // neon-http driver has no transactions, so nothing to fake). notNull: a row
    // is never created outside a batch.
    checkoutBatchId: uuid('checkout_batch_id').notNull(),
    // The checkout vendor. Text (not a pg enum) — the catalog can grow; the app
    // validates the value. Same idiom as avatars.vendor.
    provider: text('provider').notNull().default('rye'),
    // Which Rye environment placed the order — 'sandbox' | 'production'. Text,
    // validated app-side (subscriptions.environment precedent).
    environment: text('environment').notNull(),
    // Rye checkout-intent id (ci_…). Null between the claim-row insert and the
    // createIntent call; set once Rye returns an intent. The partial-unique index
    // below is the webhook's lookup key.
    intentId: text('intent_id'),
    // Denormalized ShopProduct snapshot at order time — same fields as cart_items
    // (the feed has no table to FK to).
    productId: text('product_id').notNull(),
    retailer: text('retailer').notNull(),
    title: text('title').notNull(),
    brand: text('brand'),
    imageUrl: text('image_url'),
    productUrl: text('product_url').notNull(),
    affiliateUrl: text('affiliate_url').notNull(),
    category: itemCategory('category'),
    // Per-unit price snapshot in integer cents — the basis for the createIntent
    // maxTotalCents ceiling (snapshot × quantity × 1.5).
    priceSnapshotCents: integer('price_snapshot_cents').notNull(),
    size: text('size'),
    quantity: integer('quantity').notNull().default(1),
    // Order lifecycle. Text (not a pg enum) because the Rye vocabulary can grow —
    // the subscriptions.store precedent. Values:
    //   creating | retrieving_offer | awaiting_confirmation | requires_action |
    //   placing_order | completed | failed | expired
    // The first five are the ACTIVE states covered by the double-submit index
    // below; the last three are terminal.
    status: text('status').notNull().default('creating'),
    // Offer amounts in integer cents, filled once Rye resolves the offer; null
    // while the order is still 'creating'.
    subtotalCents: integer('subtotal_cents'),
    shippingCents: integer('shipping_cents'),
    taxCents: integer('tax_cents'),
    totalCents: integer('total_cents'),
    currency: text('currency').notNull(),
    // Rye's order id once placed; null until then.
    vendorOrderId: text('vendor_order_id'),
    // Failure detail for ops; null unless status is 'failed'.
    failureReason: text('failure_reason'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    // Webhook resolution: a thin Rye event carries only the intent id, so this is
    // the lookup key. Partial-unique (filtered to non-null) so the many rows that
    // have not yet been assigned an intent don't collide on NULL.
    uniqueIndex('orders_intent_id_key')
      .on(table.intentId)
      .where(sql`${table.intentId} is not null`),
    // THE no-transaction double-submit claim. With no transactions on neon-http,
    // this partial-unique index (not a transaction) is what guarantees a user
    // cannot have two LIVE orders for the same product at once: the checkout route
    // inserts the claim row and a conflict here means "already running" → skip.
    // Filtered to the five ACTIVE states so that once an order reaches a terminal
    // state (completed/failed/expired) the user can order that product again.
    uniqueIndex('orders_user_id_product_id_active_key')
      .on(table.userId, table.productId)
      .where(
        sql`${table.status} in ('creating', 'retrieving_offer', 'awaiting_confirmation', 'requires_action', 'placing_order')`,
      ),
    // Order history listing (newest-first) + the per-user daily cap COUNT.
    index('orders_user_id_created_at_idx').on(table.userId, table.createdAt),
    // Batch fold: all members of one checkout action.
    index('orders_checkout_batch_id_idx').on(table.checkoutBatchId),
  ],
);

export const itemAngleRenders = pgTable(
  'item_angle_renders',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    itemId: uuid('item_id')
      .notNull()
      .references(() => items.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    angle: turnaroundAngle('angle').notNull(),
    // items-cutout bucket key, {userId}/{uuid}.png. Nullable: null = QA-rejected,
    // and the candidate bytes are NEVER persisted because the cutout bucket is
    // public (r2.dev) — an accepted row always has a path, a rejected row never
    // does (qaNote carries why). So imagePath IS NOT NULL ⟺ accepted is true.
    imagePath: text('image_path'),
    // Claude-vision QA verdict. Only accepted rows are ever served; a rejected
    // row is kept (accepted=false, imagePath null) for audit rather than deleted.
    accepted: boolean('accepted').notNull(),
    // Why the render was rejected; null when accepted.
    qaNote: text('qa_note'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // One render per (item, angle). A retry deletes the old row then reinserts,
    // both single statements — no transaction needed.
    unique('item_angle_renders_item_id_angle_key').on(table.itemId, table.angle),
    // The render lookup for an item's turnaround set.
    index('item_angle_renders_item_id_idx').on(table.itemId),
  ],
);
