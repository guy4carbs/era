/**
 * Postgres enums shared across the domain schema.
 */
import { pgEnum } from 'drizzle-orm/pg-core';

export const itemCategory = pgEnum('item_category', [
  'top',
  'bottom',
  'dress',
  'outerwear',
  'shoes',
  'bag',
  'hat',
  'scarf',
  'watch',
  'jewelry',
  'accessory',
]);

export const itemSource = pgEnum('item_source', ['photo', 'link', 'email_import']);

export const aiEventKind = pgEnum('ai_event_kind', [
  'tag_correction',
  'outfit_accept',
  'outfit_reject',
  'rec_click',
  'rec_dismiss',
  'quiz',
]);
