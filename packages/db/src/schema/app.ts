/**
 * Era domain schema.
 *
 * Domain tables use uuid primary keys (defaultRandom) and timestamptz-mode
 * timestamps. Every user_id is a text column referencing the Better Auth
 * `user.id` with ON DELETE CASCADE, so deleting a user tears down their data.
 */
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

export const waitlist = pgTable('waitlist', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull().unique(),
  referralCode: text('referral_code'),
  referredBy: text('referred_by'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
