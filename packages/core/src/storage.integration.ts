/**
 * @era/core — storage INTEGRATION test (live Cloudflare R2).
 *
 * This file is intentionally NOT matched by the unit test glob
 * (`src/*.test.ts`). Run it explicitly:
 *   `pnpm --filter @era/core test:integration:storage`.
 *
 * It exercises the REAL presign → HTTP round-trip against live R2 buckets and
 * proves the security model end to end:
 *   (a) an owner can presign a PUT, upload, presign a GET, and read the exact
 *       bytes back (raw bucket, private);
 *   (b) a non-owner is denied at the authz layer (FORBIDDEN) AND the private
 *       raw object is unreadable by an unsigned, network-level request
 *       (401/403 from R2 — the bucket itself is private);
 *   (c) a cutout uploaded by its owner is readable from the PUBLIC r2.dev base
 *       URL with no credentials at all (public-profile read path);
 *   (d) every object this test created is deleted and the deletion verified.
 *
 * SECRETS: this test never prints env values, presigned URLs, or object paths —
 * those URLs embed SigV4 signatures. It reads all configuration from
 * process.env and FAILS LOUDLY (naming what to set) when anything is missing.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

import { DeleteObjectCommand } from '@aws-sdk/client-s3';

import { AuthzError, type AuthContext } from './authz.ts';
import {
  createStorageClient,
  getAssetUrl,
  requestUploadUrl,
  type AssetBucket,
  type StorageConfig,
} from './storage.ts';

/**
 * A minimal, valid 1×1 PNG. Kept tiny so the round-trip is fast and the byte
 * comparison is exact. Regenerating it: any 1×1 PNG works.
 */
const PNG_1x1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

/**
 * Collect the live R2 configuration from the environment or abort with an
 * actionable message. The three credentials come from the repo-root `.env`;
 * the bucket names and public base URLs are passed inline by the runner.
 */
function requireStorageConfig(): StorageConfig {
  const missing: string[] = [];
  const need = (name: string): string => {
    const value = process.env[name];
    if (value === undefined || value.length === 0) {
      missing.push(name);
      return '';
    }
    return value;
  };

  const config: StorageConfig = {
    accountId: need('R2_ACCOUNT_ID'),
    accessKeyId: need('R2_ACCESS_KEY_ID'),
    secretAccessKey: need('R2_SECRET_ACCESS_KEY'),
    buckets: {
      'items-raw': need('R2_BUCKET_ITEMS_RAW'),
      'items-cutout': need('R2_BUCKET_ITEMS_CUTOUT'),
      'outfit-covers': need('R2_BUCKET_OUTFIT_COVERS'),
      avatars: need('R2_BUCKET_AVATARS'),
    },
    publicUrls: {
      'items-cutout': need('R2_PUBLIC_URL_CUTOUTS'),
      'outfit-covers': need('R2_PUBLIC_URL_COVERS'),
    },
  };

  if (missing.length > 0) {
    throw new Error(
      'storage.integration: missing R2 configuration: ' +
        missing.join(', ') +
        '. Source the repo-root .env (credentials) and pass the bucket/public ' +
        'vars inline, e.g. from the repo root:\n' +
        '  set -a; . ./.env; set +a; \\\n' +
        '  R2_PUBLIC_URL_CUTOUTS=https://<cutouts>.r2.dev \\\n' +
        '  R2_PUBLIC_URL_COVERS=https://<covers>.r2.dev \\\n' +
        '  R2_BUCKET_ITEMS_RAW=item-images-raw R2_BUCKET_ITEMS_CUTOUT=item-images-cutout \\\n' +
        '  R2_BUCKET_OUTFIT_COVERS=outfit-covers R2_BUCKET_AVATARS=avatars \\\n' +
        '  pnpm --filter @era/core test:integration:storage',
    );
  }
  return config;
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Fetch `url` and retry while `accept(status)` is false — r2.dev public reads
 * (and deletion propagation) can lag by up to ~a minute. Backs off between
 * attempts. Returns the final Response (whose status may still be unaccepted).
 */
async function fetchUntil(
  url: string,
  accept: (status: number) => boolean,
  attempts = 4,
): Promise<Response> {
  let response = await fetch(url);
  for (let i = 1; i < attempts && !accept(response.status); i += 1) {
    await sleep(1000 * i);
    response = await fetch(url);
  }
  return response;
}

test('storage round-trips against live R2 and enforces private-bucket access', async (t) => {
  const config = requireStorageConfig();
  const client = createStorageClient(config);

  // Distinct, run-scoped owners so repeated/concurrent runs never collide.
  const run = randomUUID().slice(0, 8);
  const idA = `itest_a_${run}`;
  const idB = `itest_b_${run}`;
  const ctxA: AuthContext = { userId: idA };
  const ctxB: AuthContext = { userId: idB };

  // Track everything we create so the finally sweep can guarantee cleanup even
  // if an assertion aborts mid-test.
  const created: Array<{ bucket: AssetBucket; key: string }> = [];
  const put = async (bucket: AssetBucket, ownerId: string, ctx: AuthContext): Promise<string> => {
    const { url, key } = await requestUploadUrl(client, ctx, {
      bucket,
      ownerId,
      ext: 'png',
      contentType: 'image/png',
    });
    const res = await fetch(url, {
      method: 'PUT',
      body: PNG_1x1,
      headers: { 'content-type': 'image/png' },
    });
    assert.equal(res.status, 200, 'presigned PUT should return 200');
    created.push({ bucket, key });
    return key;
  };

  let rawKey = '';
  let cutoutKey = '';

  try {
    // (a) ROUND-TRIP: owner presigns PUT (raw) → upload → presigns GET → read
    //     the same bytes back.
    await t.test('a: owner round-trips a raw image (bytes equal)', async () => {
      rawKey = await put('items-raw', idA, ctxA);
      const getUrl = await getAssetUrl(client, ctxA, {
        bucket: 'items-raw',
        key: rawKey,
        owner: { userId: idA, isPrivate: false },
      });
      const res = await fetch(getUrl);
      assert.equal(res.status, 200, 'presigned GET should return 200');
      const bytes = Buffer.from(await res.arrayBuffer());
      assert.ok(bytes.equals(PNG_1x1), 'downloaded bytes must equal uploaded bytes');
    });

    // (b) NON-OWNER RAW DENIED: authz FORBIDDEN for B reading A's raw object,
    //     AND an unsigned network request to the private object is refused.
    await t.test('b: non-owner is denied and the raw object is network-private', async () => {
      await assert.rejects(
        () =>
          getAssetUrl(client, ctxB, {
            bucket: 'items-raw',
            key: rawKey,
            owner: { userId: idA, isPrivate: false },
          }),
        (error: unknown) => {
          assert.ok(error instanceof AuthzError, 'expected an AuthzError');
          assert.equal(error.code, 'FORBIDDEN');
          return true;
        },
      );

      // Network-level proof: hit the object on the S3 endpoint with no
      // credentials. R2 refuses ANY unsigned S3 request up front — it returns
      // 400 InvalidArgument (no valid SigV4 Authorization) before it even
      // resolves the object, so a private object is never served or disclosed
      // to an anonymous caller. Accept R2's refusal set (400/401/403) and, more
      // importantly, assert the object bytes are NOT returned.
      const rawBucket = config.buckets['items-raw'];
      const directUrl = `https://${config.accountId}.r2.cloudflarestorage.com/${rawBucket}/${rawKey}`;
      const res = await fetch(directUrl);
      assert.ok(
        res.status === 400 || res.status === 401 || res.status === 403,
        `unsigned GET of a private raw object must be refused (400/401/403), got ${res.status}`,
      );
      const body = Buffer.from(await res.arrayBuffer());
      assert.ok(!body.equals(PNG_1x1), 'unsigned GET must not return the private object bytes');
    });

    // (c) PUBLIC CUTOUT NO AUTH: owner uploads a cutout; the r2.dev public base
    //     serves it to an anonymous caller with matching bytes.
    await t.test('c: public cutout is readable with no auth (bytes match)', async () => {
      cutoutKey = await put('items-cutout', idA, ctxA);
      const publicUrl = `${config.publicUrls['items-cutout']}/${cutoutKey}`;
      const res = await fetchUntil(publicUrl, (status) => status === 200);
      assert.equal(res.status, 200, 'public r2.dev read should return 200');
      const bytes = Buffer.from(await res.arrayBuffer());
      assert.ok(bytes.equals(PNG_1x1), 'public bytes must equal uploaded bytes');
    });

    // (d) CLEANUP + VERIFY: delete each created object and confirm it is gone.
    await t.test('d: created objects are deleted and verified gone', async () => {
      for (const { bucket, key } of created) {
        await client.s3.send(
          new DeleteObjectCommand({ Bucket: config.buckets[bucket], Key: key }),
        );
      }

      // Raw: an owner's presigned GET must now 404.
      const rawGet = await getAssetUrl(client, ctxA, {
        bucket: 'items-raw',
        key: rawKey,
        owner: { userId: idA, isPrivate: false },
      });
      const rawRes = await fetchUntil(rawGet, (status) => status === 404);
      assert.equal(rawRes.status, 404, 'deleted raw object must be 404');

      // Cutout: the public URL must now 404 (allowing for r2.dev cache lag).
      const publicUrl = `${config.publicUrls['items-cutout']}/${cutoutKey}`;
      const cutoutRes = await fetchUntil(publicUrl, (status) => status === 404);
      assert.equal(cutoutRes.status, 404, 'deleted cutout must be 404 on the public base');

      created.length = 0; // Nothing left for the finally sweep.
    });
  } finally {
    // Safety net: best-effort delete of anything still tracked (idempotent).
    for (const { bucket, key } of created) {
      try {
        await client.s3.send(
          new DeleteObjectCommand({ Bucket: config.buckets[bucket], Key: key }),
        );
      } catch {
        // Swallow — this is a cleanup backstop, not an assertion.
      }
    }
  }
});
