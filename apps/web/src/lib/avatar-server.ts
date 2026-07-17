/**
 * Server-only orchestration for the consented AI avatar — FASHN Model Creation +
 * encrypted-at-rest storage + verifiable deletion, behind the `@era/core`
 * presigning helpers.
 *
 * The flow, per user:
 *   1. CLAIM the avatar row (insert-onConflictDoNothing; the user id IS the PK, so
 *      the claimed row — not a transaction, which neon-http lacks — is the
 *      idempotency guard AND the consent record: the row's existence ⟹ consent,
 *      `consent_at` stamped server-side. A retry re-claims a `failed` row with a
 *      single conditional update, the turnaround idiom.
 *   2. Presign owner-scoped GETs for the 1–3 source photos and hand them to FASHN
 *      to build the likeness (first photo locks identity).
 *   3. Presigned-PUT the returned base image to `${userId}/avatar/` in the private
 *      avatars bucket, mark the row `ready`, then DELETE the transient source
 *      objects and NULL `source_photo_paths` — the raw user photos never outlive
 *      creation.
 *   4. Any failure marks the row `failed` (retryable).
 *
 * Deletion is the erasure counterpart: vendor seam → sweep the avatars bucket
 * under `${userId}/` → drop the user's try-on rows → drop the avatar row → re-count
 * the prefix to VERIFY zero. Storage is swept BEFORE any DB write, so a storage
 * failure leaves the DB intact and the caller (the route) 500s and safely retries.
 *
 * Never import from a client bundle — it talks to the database, R2, and FASHN.
 */
import { and, count, eq, gte } from 'drizzle-orm';

import {
  type AuthContext,
  countObjectsUnderPrefix,
  deleteObjectsUnderPrefix,
  getAssetUrl,
  requestUploadUrl,
} from '@era/core';
import type { AvatarState } from '@era/core/tryon';
import { type DbClient, aiUsage, avatars, createDbClient, outfitTryons } from '@era/db';

import { utcMonthStart } from './ai-usage.ts';
import { createFashnModel, deleteFashnModel } from './fashn.ts';
import { serverStorageClient } from './storage-server.ts';

const moduleDb = createDbClient(process.env.DATABASE_URL!);

/** At most this many source photos build one avatar likeness (FASHN takes 1–3). */
export const MAX_AVATAR_SOURCE_PHOTOS = 3;

/** The `${userId}/avatar-src/…` sub-prefix the transient source uploads land under. */
const AVATAR_SRC_SUBDIR = 'avatar-src';
/** The `${userId}/avatar/…` sub-prefix the finished base image lands under. */
const AVATAR_SUBDIR = 'avatar';

/** Per-subscriber, per-UTC-month ceiling on avatar creations (bounds FASHN spend). */
export const AVATAR_MONTHLY_CREATE_LIMIT = 3;

/** The `ai_usage.route` label for avatar-creation spend (not a per-user AI rate-limited route). */
const AVATAR_USAGE_ROUTE = 'avatar';
/** The `ai_usage.model` label for a FASHN model-creation call. */
const AVATAR_USAGE_MODEL = 'fashn-model-create';
/** Flat per-call cost estimate for the spend log (FASHN model-create, plan-pinned). */
const AVATAR_CALL_COST_USD = '0.075';

/** Base-image upload budget for the presigned PUT of the finished avatar. */
const BASE_IMAGE_UPLOAD_TIMEOUT_MS = 10_000;

/**
 * True when `keys` is a well-formed set of 1–{@link MAX_AVATAR_SOURCE_PHOTOS}
 * source-photo keys, each sitting under the caller's OWN `${userId}/avatar-src/`
 * prefix. This is the key-authz guard: a caller can never point avatar creation at
 * another user's objects or at a bucket path outside the transient source area.
 * Pure; never throws.
 */
export function areValidAvatarSourceKeys(userId: string, keys: unknown): keys is string[] {
  if (!Array.isArray(keys) || keys.length < 1 || keys.length > MAX_AVATAR_SOURCE_PHOTOS) {
    return false;
  }
  const prefix = `${userId}/${AVATAR_SRC_SUBDIR}/`;
  return keys.every((key) => typeof key === 'string' && key.startsWith(prefix));
}

/** The per-subscriber monthly avatar-creation cap decision, counted over `ai_usage` rows. */
export interface AvatarLimitCheck {
  readonly allowed: boolean;
  readonly used: number;
  readonly limit: number;
}

/**
 * Count this UTC-month's avatar creations for a user and decide whether one more
 * is allowed. Called BEFORE the claim — a false `allowed` means the route returns
 * its monthly-limit response. Keyed to {@link utcMonthStart}.
 */
export async function checkAvatarMonthlyLimit(db: DbClient, userId: string): Promise<AvatarLimitCheck> {
  const [row] = await db
    .select({ used: count() })
    .from(aiUsage)
    .where(and(eq(aiUsage.userId, userId), eq(aiUsage.route, AVATAR_USAGE_ROUTE), gte(aiUsage.createdAt, utcMonthStart())));
  const used = Number(row?.used ?? 0);
  return { allowed: used + 1 <= AVATAR_MONTHLY_CREATE_LIMIT, used, limit: AVATAR_MONTHLY_CREATE_LIMIT };
}

/**
 * Load the current avatar state for a user: `none` when no row, else the row's
 * status with an ISO `createdAt` and — only when `ready` — an owner-presigned
 * preview GET of the base image. Reading your own state is free (no Plus gate).
 * A preview-URL presign failure degrades to `null` rather than failing the read.
 */
export async function getAvatarState(db: DbClient, ctx: AuthContext, userId: string): Promise<AvatarState> {
  const [row] = await db
    .select({ status: avatars.status, baseImagePath: avatars.baseImagePath, createdAt: avatars.createdAt })
    .from(avatars)
    .where(eq(avatars.userId, userId))
    .limit(1);

  if (!row) {
    return { status: 'none' };
  }

  let previewUrl: string | null = null;
  if (row.status === 'ready' && row.baseImagePath) {
    try {
      previewUrl = await getAssetUrl(serverStorageClient(), ctx, {
        bucket: 'avatars',
        key: row.baseImagePath,
        owner: { userId, isPrivate: true },
      });
    } catch (error) {
      console.error('[era-tryon] avatar preview presign failed; returning null previewUrl:', error);
    }
  }

  return { status: row.status, createdAt: row.createdAt.toISOString(), previewUrl };
}

/** Insert one avatar-creation `ai_usage` row, best-effort — a spend-log miss must not fail creation. */
async function recordAvatarUsage(db: DbClient, userId: string): Promise<void> {
  try {
    await db.insert(aiUsage).values({
      userId,
      route: AVATAR_USAGE_ROUTE,
      model: AVATAR_USAGE_MODEL,
      inputTokens: null,
      outputTokens: null,
      costUsd: AVATAR_CALL_COST_USD,
    });
  } catch (error) {
    console.error('[era-tryon] failed to record avatar AI usage; continuing:', error);
  }
}

/** Stamp the avatar row failed with an ops-facing error string. */
async function failAvatar(db: DbClient, userId: string, error: string): Promise<void> {
  await db.update(avatars).set({ status: 'failed', error }).where(eq(avatars.userId, userId));
}

/**
 * Fetch one of our own presigned R2 GETs and re-encode as a base64 data URL.
 * Used for every image handed to the try-on vendor so no URL with the internal
 * userId in its path leaves our infrastructure. Throws on any failure.
 */
async function fetchAsDataUrl(presignedUrl: string): Promise<string> {
  const response = await fetch(presignedUrl, { signal: AbortSignal.timeout(10_000) });
  if (!response.ok) {
    throw new Error(`source fetch returned ${response.status}`);
  }
  const mime = response.headers.get('content-type') ?? 'image/png';
  const bytes = Buffer.from(await response.arrayBuffer());
  return `data:${mime};base64,${bytes.toString('base64')}`;
}

/** PUT raw bytes to a presigned URL; throws on a non-2xx or a network/timeout error. */
async function putBytes(url: string, bytes: Uint8Array, contentType: string, timeoutMs: number): Promise<void> {
  const put = await fetch(url, {
    method: 'PUT',
    headers: { 'Content-Type': contentType },
    body: bytes as BodyInit,
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!put.ok) {
    throw new Error(`avatar base image upload returned ${put.status}`);
  }
}

/** The outcome of an avatar-creation attempt — success carries the fresh state. */
export type CreateAvatarResult =
  | { readonly ok: true; readonly state: AvatarState }
  | { readonly ok: false; readonly code: 'already_exists' | 'creating' | 'creation_failed' };

/**
 * Claim and build a user's avatar from validated source-photo keys. Idempotent via
 * the claimed row (the user id is the PK): a live `creating` row → `creating`; a
 * `ready` row → `already_exists`; a `failed` row → re-claimed and regenerated. On
 * a fresh/re-claimed run it presigns the sources, calls FASHN, uploads the base
 * image, marks `ready`, then erases the transient sources. Any pipeline failure
 * marks the row `failed` and returns `creation_failed` (retryable).
 *
 * Caller contract: `photoKeys` MUST already be validated with
 * {@link areValidAvatarSourceKeys}; this drives R2 presigns off them.
 */
export async function createAvatar(
  ctx: AuthContext,
  userId: string,
  photoKeys: string[],
  db: DbClient = moduleDb,
): Promise<CreateAvatarResult> {
  // 1) CLAIM — the PK conflict is the concurrency + consent guard.
  const [claimed] = await db
    .insert(avatars)
    .values({ userId, status: 'creating', consentAt: new Date(), sourcePhotoPaths: photoKeys })
    .onConflictDoNothing()
    .returning();

  if (!claimed) {
    const [existing] = await db.select({ status: avatars.status }).from(avatars).where(eq(avatars.userId, userId)).limit(1);
    if (!existing || existing.status === 'creating') {
      return { ok: false, code: 'creating' };
    }
    if (existing.status === 'ready') {
      return { ok: false, code: 'already_exists' };
    }
    // status === 'failed' → re-claim in a single conditional update; 0 rows means
    // someone else won the retry, so back off as still-creating.
    const [reclaimed] = await db
      .update(avatars)
      .set({ status: 'creating', error: null, consentAt: new Date(), sourcePhotoPaths: photoKeys })
      .where(and(eq(avatars.userId, userId), eq(avatars.status, 'failed')))
      .returning();
    if (!reclaimed) {
      return { ok: false, code: 'creating' };
    }
  }

  const client = serverStorageClient();

  // 2) Load the source photos ourselves (owner-presigned GETs) and hand FASHN
  // base64 data URLs — never our R2 URLs, whose paths embed the internal
  // userId (Shield: data minimization; the vendor sees pixels, not identifiers).
  let sourceInputs: string[];
  try {
    sourceInputs = await Promise.all(
      photoKeys.map(async (key) => {
        const url = await getAssetUrl(client, ctx, { bucket: 'avatars', key, owner: { userId, isPrivate: true } });
        return fetchAsDataUrl(url);
      }),
    );
  } catch (error) {
    console.error('[era-tryon] avatar source load failed:', error);
    await failAvatar(db, userId, 'source_presign_failed');
    return { ok: false, code: 'creation_failed' };
  }

  const model = await createFashnModel(sourceInputs);
  // The FASHN call is billable whether or not it yields a usable image; record it.
  await recordAvatarUsage(db, userId);
  if (!model) {
    await failAvatar(db, userId, 'model_creation_failed');
    return { ok: false, code: 'creation_failed' };
  }

  // 3) Upload the base image to `${userId}/avatar/`, then mark ready.
  let baseImagePath: string;
  try {
    const { url, key } = await requestUploadUrl(client, ctx, {
      bucket: 'avatars',
      ownerId: userId,
      ext: 'png',
      contentType: 'image/png',
      subdir: AVATAR_SUBDIR,
    });
    await putBytes(url, model.modelImageBytes, 'image/png', BASE_IMAGE_UPLOAD_TIMEOUT_MS);
    baseImagePath = key;
  } catch (error) {
    console.error('[era-tryon] avatar base image upload failed:', error);
    await failAvatar(db, userId, 'base_image_upload_failed');
    return { ok: false, code: 'creation_failed' };
  }

  await db
    .update(avatars)
    .set({ status: 'ready', baseImagePath, vendorModelId: model.vendorModelId, error: null })
    .where(eq(avatars.userId, userId));

  // 4) Erase the transient sources, then null the column — the raw photos never
  //    outlive creation. Best-effort per key: a lingering source object is swept
  //    by account deletion's `${userId}/` prefix sweep, so a delete miss here must
  //    not fail a completed avatar.
  for (const key of photoKeys) {
    try {
      await deleteObjectsUnderPrefix(client, client.config.buckets.avatars, key);
    } catch (error) {
      console.error('[era-tryon] source photo delete failed; account-deletion sweep will catch it:', error);
    }
  }
  await db.update(avatars).set({ sourcePhotoPaths: null }).where(eq(avatars.userId, userId));

  return { ok: true, state: await getAvatarState(db, ctx, userId) };
}

/** The verified result of avatar deletion: how many objects were removed, and how many remain (must be 0). */
export interface DeleteAvatarResult {
  readonly storageObjectsDeleted: number;
  readonly remaining: number;
}

/**
 * Irreversibly delete a user's avatar and every render built from it. Order is
 * erasure-safe: vendor seam → sweep the avatars bucket under `${userId}/` (which
 * covers the base image, any source stragglers, AND the `tryon/` renders) → drop
 * the user's `outfit_tryons` rows → drop the avatar row → RE-COUNT the prefix to
 * verify zero. Storage is swept BEFORE any DB write: a storage throw propagates to
 * the route (→ 500) with the DB untouched, so the delete is safely retryable and
 * never reports a completed erasure that isn't. Idempotent — deleting when no
 * avatar exists still sweeps and returns zero counts.
 * @throws on any R2 or DB failure (the route maps it to 500).
 */
export async function deleteAvatar(userId: string, db: DbClient = moduleDb): Promise<DeleteAvatarResult> {
  const client = serverStorageClient();
  const bucket = client.config.buckets.avatars;
  const prefix = `${userId}/`;

  // 1) Vendor seam — record intent with the stored model id (no-op today).
  const [row] = await db.select({ vendorModelId: avatars.vendorModelId }).from(avatars).where(eq(avatars.userId, userId)).limit(1);
  await deleteFashnModel(row?.vendorModelId ?? null);

  // 2) Storage FIRST — throw here leaves the DB fully intact (retryable).
  const storageObjectsDeleted = await deleteObjectsUnderPrefix(client, bucket, prefix);

  // 3-4) Now the DB: the user's renders, then the avatar row itself.
  await db.delete(outfitTryons).where(eq(outfitTryons.userId, userId));
  await db.delete(avatars).where(eq(avatars.userId, userId));

  // 5) Verify the erasure reached zero objects before reporting success.
  const remaining = await countObjectsUnderPrefix(client, bucket, prefix);
  return { storageObjectsDeleted, remaining };
}
