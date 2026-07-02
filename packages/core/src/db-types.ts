/**
 * @era/core — the database type contract, re-exported.
 *
 * These are the inferred row/insert types owned by `@era/db` (Vector's domain).
 * Core re-exports them type-only so that service and route layers can depend on
 * a single import surface (`@era/core`) for both domain logic and persistence
 * shapes, without importing the live Drizzle client where it is not needed.
 *
 * Type-only re-exports: erased at build time, so this file adds no runtime edge
 * to `@era/db`.
 */

export type {
  Profile,
  NewProfile,
  StyleProfile,
  NewStyleProfile,
  Item,
  NewItem,
  Outfit,
  NewOutfit,
  OutfitItem,
  NewOutfitItem,
  Era,
  NewEra,
  EraOutfit,
  NewEraOutfit,
  WearLog,
  NewWearLog,
  Follow,
  NewFollow,
  AiEvent,
  NewAiEvent,
  WaitlistEntry,
  NewWaitlistEntry,
  AuthUser,
  ItemCategory,
  ItemSource,
  AiEventKind,
} from '@era/db';
