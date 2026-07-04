/**
 * @era/core — Cloudflare R2 object-storage access.
 *
 * ============================================================================
 * SECURITY MODEL
 * ============================================================================
 * R2 credentials live ONLY on the server and never reach any client bundle.
 * A client never talks to R2 with credentials; instead it asks an API route,
 * the route authorizes the caller through the guards in {@link ./authz.ts},
 * and only then does the server mint a SHORT-LIVED presigned URL (5 minutes)
 * for a single object. Every presign path in this module is gated by an authz
 * guard BEFORE the URL is produced — there is no code path that signs without
 * first authorizing.
 *
 * Clients downscale images to a max of 1600px on the long edge BEFORE
 * uploading; this module does not resize — it only brokers signed access.
 *
 * Two of the four buckets (cutouts, outfit covers) are served publicly from a
 * base URL for PUBLIC profiles: those reads need no credentials and no signing,
 * so an anonymous caller may read them. Everything else — raw originals,
 * avatars, and any PRIVATE owner's cutouts/covers — is reachable only through
 * an authorized, short-lived presigned GET.
 * ============================================================================
 */

import { randomUUID } from 'node:crypto';

import {
  DeleteObjectsCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

import { AuthzError, ownerOnly, publicReadable, type AuthContext } from './authz.ts';
import type { ServerEnv } from './env.ts';

/** The four asset buckets. Raw + avatars are always private; the other two may be public. */
export type AssetBucket = 'items-raw' | 'items-cutout' | 'outfit-covers' | 'avatars';

/** Buckets whose objects can be served from a public base URL (for public profiles). */
type PublicBucket = 'items-cutout' | 'outfit-covers';

/**
 * Server-side R2 configuration. Holds the credentials and the resolved bucket
 * names + public base URLs. Never construct this on a client.
 */
export interface StorageConfig {
  readonly accountId: string;
  readonly accessKeyId: string;
  readonly secretAccessKey: string;
  readonly buckets: Record<AssetBucket, string>;
  readonly publicUrls: Record<PublicBucket, string>;
}

/** A ready-to-use storage handle: the S3 client plus the config it was built from. */
export interface StorageClient {
  readonly s3: S3Client;
  readonly config: StorageConfig;
}

/** How long a presigned URL stays valid, in seconds. Deliberately short. */
const PRESIGN_EXPIRES_IN = 300;

/** File extensions permitted for asset keys (lowercased). */
const EXT_ALLOWLIST: ReadonlySet<string> = new Set(['jpg', 'jpeg', 'png', 'webp', 'avif']);

/** Content types permitted for uploads. */
const CONTENT_TYPE_ALLOWLIST: ReadonlySet<string> = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/avif',
]);

/**
 * Bridge {@link ServerEnv} (validated by {@link ./env.ts}) into a
 * {@link StorageConfig}. Call after `loadServerEnv()` at server startup.
 */
export function storageConfigFromEnv(env: ServerEnv): StorageConfig {
  return {
    accountId: env.R2_ACCOUNT_ID,
    accessKeyId: env.R2_ACCESS_KEY_ID,
    secretAccessKey: env.R2_SECRET_ACCESS_KEY,
    buckets: {
      'items-raw': env.R2_BUCKET_ITEMS_RAW,
      'items-cutout': env.R2_BUCKET_ITEMS_CUTOUT,
      'outfit-covers': env.R2_BUCKET_OUTFIT_COVERS,
      avatars: env.R2_BUCKET_AVATARS,
    },
    publicUrls: {
      'items-cutout': env.R2_PUBLIC_URL_CUTOUTS,
      'outfit-covers': env.R2_PUBLIC_URL_COVERS,
    },
  };
}

/**
 * Build a {@link StorageClient} for R2. R2 is S3-compatible: region is `auto`
 * and the endpoint is the account-scoped `r2.cloudflarestorage.com` host.
 */
export function createStorageClient(config: StorageConfig): StorageClient {
  const s3 = new S3Client({
    region: 'auto',
    endpoint: `https://${config.accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  });
  return { s3, config };
}

/**
 * Produce an object key of the form `{userId}/{uuid}.{ext}`.
 *
 * Path-traversal guard: `userId` must not be empty and must not contain `/`,
 * `..`, or whitespace — otherwise a caller could escape their own prefix.
 * `ext` is lowercased and checked against {@link EXT_ALLOWLIST}.
 * @throws {Error} when `userId` is unsafe or `ext` is not an allowed image ext.
 */
export function assetKey(userId: string, ext: string): string {
  if (userId.length === 0 || /[/\s]|\.\./.test(userId)) {
    throw new Error('Invalid userId for asset key.');
  }
  const normalized = ext.toLowerCase();
  if (!EXT_ALLOWLIST.has(normalized)) {
    throw new Error('Unsupported asset file extension.');
  }
  return `${userId}/${randomUUID()}.${normalized}`;
}

/**
 * Authorize an upload and return a short-lived presigned PUT plus the key the
 * client must PUT to. Uploads are ALWAYS owner-scoped (including avatars), so
 * the caller must be the owner.
 * @throws {AuthzError} `UNAUTHENTICATED`/`FORBIDDEN` via {@link ownerOnly}.
 * @throws {Error} when `contentType` or `ext` is not an allowed image type.
 */
export async function requestUploadUrl(
  client: StorageClient,
  ctx: AuthContext,
  opts: { bucket: AssetBucket; ownerId: string; ext: string; contentType: string },
): Promise<{ url: string; key: string; expiresIn: number }> {
  ownerOnly(ctx, opts.ownerId);
  if (!CONTENT_TYPE_ALLOWLIST.has(opts.contentType)) {
    throw new Error('Unsupported upload content type.');
  }
  const key = assetKey(opts.ownerId, opts.ext);
  const command = new PutObjectCommand({
    Bucket: client.config.buckets[opts.bucket],
    Key: key,
    ContentType: opts.contentType,
  });
  const url = await getSignedUrl(client.s3, command, { expiresIn: PRESIGN_EXPIRES_IN });
  return { url, key, expiresIn: PRESIGN_EXPIRES_IN };
}

/**
 * Resolve a readable URL for an asset, enforcing visibility:
 *   - `items-cutout` / `outfit-covers` of a PUBLIC owner → unsigned public URL
 *     (no auth; anonymous callers may read).
 *   - `items-cutout` / `outfit-covers` of a PRIVATE owner → {@link publicReadable}
 *     (owner only), then a presigned GET.
 *   - `items-raw` / `avatars` ALWAYS → {@link ownerOnly}, then a presigned GET.
 *
 * The `key` must live under the claimed owner's prefix (`{owner.userId}/…`);
 * a mismatch throws `FORBIDDEN` so a caller cannot sign another user's object
 * by passing a fabricated `owner`.
 * @throws {AuthzError} on any authorization failure or key/owner mismatch.
 */
export async function getAssetUrl(
  client: StorageClient,
  ctx: AuthContext,
  opts: { bucket: AssetBucket; key: string; owner: { userId: string; isPrivate: boolean } },
): Promise<string> {
  if (!opts.key.startsWith(`${opts.owner.userId}/`)) {
    throw new AuthzError('FORBIDDEN');
  }

  if (opts.bucket === 'items-cutout' || opts.bucket === 'outfit-covers') {
    if (!opts.owner.isPrivate) {
      return `${client.config.publicUrls[opts.bucket]}/${opts.key}`;
    }
    publicReadable(ctx, opts.owner);
  } else {
    ownerOnly(ctx, opts.owner.userId);
  }

  const command = new GetObjectCommand({
    Bucket: client.config.buckets[opts.bucket],
    Key: opts.key,
  });
  return getSignedUrl(client.s3, command, { expiresIn: PRESIGN_EXPIRES_IN });
}

/** DeleteObjects accepts at most this many keys per request (S3/R2 hard cap). */
const DELETE_BATCH_MAX = 1000;

/**
 * Irreversibly delete EVERY object a user owns across ALL asset buckets — the
 * storage half of full-account deletion (GDPR right-to-erasure + the App Store
 * account-deletion requirement). The done-criterion is "zero storage objects".
 *
 * For each bucket in the config it paginates {@link ListObjectsV2Command} under
 * the prefix `${userId}/`, following `ContinuationToken` to the very end — it
 * never stops at the 1000-key page cap — then removes the collected keys with
 * {@link DeleteObjectsCommand} in batches of ≤1000 ({@link DELETE_BATCH_MAX}).
 *
 * PREFIX SAFETY: the prefix is EXACTLY `${userId}/` with a trailing slash, so a
 * user `"abc"` can never match objects under `"abcd/…"`. `userId` must be a
 * non-empty, non-whitespace string; a blank id is refused outright rather than
 * risking a bucket-wide (empty-prefix) delete.
 *
 * There is NO silent partial delete: any AWS error propagates to the caller,
 * which decides how to react (the delete-account route runs this BEFORE it
 * touches the database, so a failure here leaves the account fully intact and
 * safely retryable).
 *
 * @returns the total number of objects deleted plus a per-bucket breakdown
 *   (keyed by the resolved bucket name).
 * @throws {Error} when `userId` is empty/whitespace, or on any AWS failure.
 */
export async function deleteUserObjects(
  client: StorageClient,
  userId: string,
): Promise<{ deleted: number; byBucket: Record<string, number> }> {
  if (userId.trim().length === 0) {
    throw new Error('Refusing to delete objects for an empty userId.');
  }
  const prefix = `${userId}/`;

  const byBucket: Record<string, number> = {};
  let deleted = 0;

  for (const bucket of Object.values(client.config.buckets)) {
    let bucketDeleted = 0;
    let continuationToken: string | undefined;

    do {
      const listed = await client.s3.send(
        new ListObjectsV2Command({
          Bucket: bucket,
          Prefix: prefix,
          ContinuationToken: continuationToken,
        }),
      );

      const keys = (listed.Contents ?? [])
        .map((object) => object.Key)
        .filter((key): key is string => typeof key === 'string');

      // Delete in batches of ≤1000 (a page can hold up to 1000 keys, and
      // DeleteObjects refuses more than that per request).
      for (let i = 0; i < keys.length; i += DELETE_BATCH_MAX) {
        const batch = keys.slice(i, i + DELETE_BATCH_MAX);
        const result = await client.s3.send(
          new DeleteObjectsCommand({
            Bucket: bucket,
            Delete: { Objects: batch.map((Key) => ({ Key })), Quiet: true },
          }),
        );
        // DeleteObjects returns HTTP 200 even when individual keys fail to
        // delete — those failures come back in `Errors` and do NOT throw. For an
        // erasure whose done-criterion is "zero objects", a silently-swallowed
        // partial failure is a correctness bug, so surface it: the delete-account
        // route catches this, returns 500, and the caller safely retries rather
        // than being told (falsely) that deletion completed.
        if (result.Errors && result.Errors.length > 0) {
          throw new Error(`DeleteObjects left ${result.Errors.length} object(s) undeleted.`);
        }
        bucketDeleted += batch.length;
      }

      // Only follow the cursor while the listing is truncated.
      continuationToken = listed.IsTruncated ? listed.NextContinuationToken : undefined;
    } while (continuationToken);

    byBucket[bucket] = bucketDeleted;
    deleted += bucketDeleted;
  }

  return { deleted, byBucket };
}
