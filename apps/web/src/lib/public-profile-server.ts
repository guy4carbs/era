/**
 * Public-profile loader — the read model behind a `/{username}` profile page.
 *
 * ONE entry point, {@link loadPublicProfile}, returns a discriminated union so
 * the caller renders declaratively off `state`:
 *
 *   - `not_found` — no profile owns that username, OR the username is reserved
 *     (an app-route name; see `@era/core` `isReservedUsername`). Reserved names
 *     are rejected WITHOUT a database hit.
 *   - `private`  — the owner's profile is private. Existence IS confirmed (the
 *     product call: a private account shows a minimal Instagram-style card —
 *     username, display name, avatar, follower count, and the viewer's follow
 *     state) but NO wardrobe content is exposed. Following a private account is
 *     allowed and only bumps the count; it does not unlock content.
 *   - `public`   — full profile: identity, a capped page of non-archived items
 *     (newest first, cutout imagery served from the public R2 base) with the
 *     total item count alongside, plus eras and outfits shaped for a grid, and
 *     follower/following counts + the viewer's follow state.
 *
 * VISIBILITY: a public owner's cutouts/covers resolve to unsigned public URLs
 * via {@link getAssetUrl} (bucket-gated). Raw originals are NEVER exposed here —
 * an item with only a raw upload (no cutout yet) gets a `null` image, because
 * the raw bucket is owner-only and presigning it for a stranger is wrong.
 *
 * EFFICIENCY: every collection is one batched query (items, eras, an eras→count
 * roll-up, outfits) plus live COUNT()s over the indexed `follows` columns — no
 * per-row lookups (no N+1). Items are capped; the true total ships separately as
 * `publicItemCount`.
 *
 * `isFollowing` is always `false` for an anonymous viewer (`viewerUserId` null).
 * Never import from a client bundle — it talks to the database and R2.
 */
import { and, count, desc, eq, gte, inArray } from 'drizzle-orm';

import { type AuthContext, type StorageClient, getAssetUrl, isReservedUsername } from '@era/core';
import { type DbClient, eraOutfits, eras, items, outfits, profiles } from '@era/db';

import { type AssetOwner, coverUrl } from './outfit-server.ts';
import { countFollowers, countFollowing, isFollowing } from './follows-server.ts';
import { PUBLIC_PROFILE_MIN_ITEMS } from './profile-presenter.ts';

/** Newest items returned on a public profile; the true total ships separately. */
const ITEMS_CAP = 60;
/** Eras / outfits returned for the profile grids. */
const ERAS_CAP = 60;
const OUTFITS_CAP = 60;

/** The minimal identity card shown for any existing profile (public or private). */
export interface PublicProfileIdentity {
  readonly username: string;
  readonly displayName: string | null;
  readonly avatarUrl: string | null;
  /**
   * When the profile was created, as an ISO 8601 string. Exposed as a string
   * (not a Date) so the read-model stays plainly JSON-serializable and feeds
   * the profile page's JSON-LD `dateCreated`/`dateModified` verbatim.
   */
  readonly createdAt: string;
}

/** One item tile on a public profile grid. `imageUrl` is the public cutout, or null. */
export interface PublicProfileItem {
  readonly id: string;
  readonly name: string;
  readonly category: string;
  readonly color: string | null;
  readonly imageUrl: string | null;
}

/** One era card on a public profile. `coverUrl` is the era's own cover, or null. */
export interface PublicProfileEra {
  readonly id: string;
  readonly title: string;
  readonly coverUrl: string | null;
  readonly outfitCount: number;
}

/** One outfit card on a public profile. `coverUrl` is the outfit cover, or null. */
export interface PublicProfileOutfit {
  readonly id: string;
  readonly name: string | null;
  readonly coverUrl: string | null;
}

/** No such username, or a reserved (app-route) name. */
export interface PublicProfileNotFound {
  readonly state: 'not_found';
}

/** A private account: existence confirmed, content withheld. */
export interface PublicProfilePrivate {
  readonly state: 'private';
  readonly profile: PublicProfileIdentity;
  readonly followerCount: number;
  readonly isFollowing: boolean;
}

/** A public account: full read model. */
export interface PublicProfilePublic {
  readonly state: 'public';
  readonly profile: PublicProfileIdentity;
  readonly items: readonly PublicProfileItem[];
  readonly eras: readonly PublicProfileEra[];
  readonly outfits: readonly PublicProfileOutfit[];
  readonly followerCount: number;
  readonly followingCount: number;
  readonly isFollowing: boolean;
  readonly publicItemCount: number;
}

export type PublicProfileResult = PublicProfileNotFound | PublicProfilePrivate | PublicProfilePublic;

/**
 * Load the public view of `username` as seen by `viewerUserId` (null = anon).
 * See the module doc for the state contract. `db`/`storage` are injected so the
 * loader is unit-testable without a live backend.
 */
export async function loadPublicProfile(
  db: DbClient,
  storage: StorageClient,
  username: string,
  viewerUserId: string | null,
): Promise<PublicProfileResult> {
  // Reserved names never resolve to a profile — reject before any query.
  if (isReservedUsername(username)) {
    return { state: 'not_found' };
  }

  const [row] = await db
    .select({
      userId: profiles.userId,
      username: profiles.username,
      displayName: profiles.displayName,
      avatarUrl: profiles.avatarUrl,
      createdAt: profiles.createdAt,
      isPrivate: profiles.isPrivate,
    })
    .from(profiles)
    .where(eq(profiles.username, username))
    .limit(1);

  if (!row) {
    return { state: 'not_found' };
  }

  const ownerId = row.userId;
  const identity: PublicProfileIdentity = {
    username: row.username,
    displayName: row.displayName,
    avatarUrl: row.avatarUrl,
    createdAt: row.createdAt.toISOString(),
  };

  const followerCount = await countFollowers(db, ownerId);
  const viewerFollows = await isFollowing(db, viewerUserId, ownerId);

  if (row.isPrivate) {
    return { state: 'private', profile: identity, followerCount, isFollowing: viewerFollows };
  }

  // --- Public profile: content is served. -----------------------------------
  const ctx: AuthContext = { userId: viewerUserId };
  const owner: AssetOwner = { userId: ownerId, isPrivate: false };

  const followingCount = await countFollowing(db, ownerId);

  const [countRow] = await db
    .select({ n: count() })
    .from(items)
    .where(and(eq(items.userId, ownerId), eq(items.archived, false)));
  const publicItemCount = Number(countRow?.n ?? 0);

  const itemRows = await db
    .select({
      id: items.id,
      name: items.name,
      category: items.category,
      color: items.colorPrimary,
      imageCutoutPath: items.imageCutoutPath,
    })
    .from(items)
    .where(and(eq(items.userId, ownerId), eq(items.archived, false)))
    .orderBy(desc(items.createdAt))
    .limit(ITEMS_CAP);

  // Cutout only — the raw bucket is owner-scoped, never presigned for a stranger.
  const publicItems: PublicProfileItem[] = await Promise.all(
    itemRows.map(async (item) => ({
      id: item.id,
      name: item.name,
      category: item.category,
      color: item.color,
      imageUrl: item.imageCutoutPath
        ? await getAssetUrl(storage, ctx, { bucket: 'items-cutout', key: item.imageCutoutPath, owner })
        : null,
    })),
  );

  const eraRows = await db
    .select({ id: eras.id, title: eras.title, coverImagePath: eras.coverImagePath })
    .from(eras)
    .where(eq(eras.userId, ownerId))
    .orderBy(desc(eras.createdAt))
    .limit(ERAS_CAP);

  // One grouped roll-up for every listed era's outfit count (no per-era query).
  const eraIds = eraRows.map((e) => e.id);
  const countRows = eraIds.length
    ? await db
        .select({ eraId: eraOutfits.eraId, n: count() })
        .from(eraOutfits)
        .where(inArray(eraOutfits.eraId, eraIds))
        .groupBy(eraOutfits.eraId)
    : [];
  const outfitCountByEra = new Map<string, number>(countRows.map((c) => [c.eraId, Number(c.n)]));

  const publicEras: PublicProfileEra[] = await Promise.all(
    eraRows.map(async (era) => ({
      id: era.id,
      title: era.title,
      coverUrl: await coverUrl(storage, ctx, era.coverImagePath, owner),
      outfitCount: outfitCountByEra.get(era.id) ?? 0,
    })),
  );

  const outfitRows = await db
    .select({ id: outfits.id, name: outfits.name, coverImagePath: outfits.coverImagePath })
    .from(outfits)
    .where(eq(outfits.userId, ownerId))
    .orderBy(desc(outfits.createdAt))
    .limit(OUTFITS_CAP);

  const publicOutfits: PublicProfileOutfit[] = await Promise.all(
    outfitRows.map(async (outfit) => ({
      id: outfit.id,
      name: outfit.name,
      coverUrl: await coverUrl(storage, ctx, outfit.coverImagePath, owner),
    })),
  );

  return {
    state: 'public',
    profile: identity,
    items: publicItems,
    eras: publicEras,
    outfits: publicOutfits,
    followerCount,
    followingCount,
    isFollowing: viewerFollows,
    publicItemCount,
  };
}

/** One indexable profile for the sitemap: its username and a `lastModified` date. */
export interface IndexableProfile {
  readonly username: string;
  readonly updatedAt: Date;
}

/**
 * The public, NON-thin profiles the sitemap should list — public accounts with at
 * least {@link PUBLIC_PROFILE_MIN_ITEMS} non-archived items (the same "thin" bar
 * the page uses to decide `noindex`, so the sitemap and the page's robots signal
 * never disagree). One grouped COUNT over the indexed `items.user_id`; capped so a
 * runaway table can't produce an unbounded sitemap. `updatedAt` is the profile's
 * `createdAt` (the newest signal the read model exposes today — profiles have no
 * `updatedAt` column this phase).
 *
 * Server-only — talks to the database. Never import from a client bundle.
 */
export async function listIndexableProfiles(db: DbClient, limit = 5000): Promise<IndexableProfile[]> {
  const rows = await db
    .select({ username: profiles.username, createdAt: profiles.createdAt })
    .from(profiles)
    .innerJoin(items, and(eq(items.userId, profiles.userId), eq(items.archived, false)))
    .where(eq(profiles.isPrivate, false))
    .groupBy(profiles.username, profiles.createdAt)
    .having(gte(count(items.id), PUBLIC_PROFILE_MIN_ITEMS))
    .limit(limit);

  return rows.map((row) => ({ username: row.username, updatedAt: row.createdAt ?? new Date() }));
}
