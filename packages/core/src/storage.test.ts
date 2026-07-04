import { test } from 'node:test';
import assert from 'node:assert/strict';

import { DeleteObjectsCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';

import { AuthzError, type AuthContext } from './authz.ts';
import {
  assetKey,
  createStorageClient,
  deleteUserObjects,
  getAssetUrl,
  requestUploadUrl,
  type StorageClient,
  type StorageConfig,
} from './storage.ts';

// Fake config — obvious placeholders. S3Client presigning is a pure local
// crypto operation over these creds; no network call is ever made.
const config: StorageConfig = {
  accountId: 'fake-account',
  accessKeyId: 'fake-access-key',
  secretAccessKey: 'fake-secret-key',
  buckets: {
    'items-raw': 'era-items-raw',
    'items-cutout': 'era-items-cutout',
    'outfit-covers': 'era-outfit-covers',
    avatars: 'era-avatars',
  },
  publicUrls: {
    'items-cutout': 'https://pub-cutouts.r2.dev',
    'outfit-covers': 'https://pub-covers.r2.dev',
  },
};
const client = createStorageClient(config);

const A = 'user_A';
const B = 'user_B';
const ctxA: AuthContext = { userId: A };
const ctxB: AuthContext = { userId: B };
const anon: AuthContext = { userId: null };

function assertAuthz(fn: () => unknown, code: AuthzError['code']): Promise<void> | void {
  return assert.rejects(async () => fn(), (error: unknown) => {
    assert.ok(error instanceof AuthzError, 'expected an AuthzError');
    assert.equal(error.code, code);
    return true;
  });
}

// --- assetKey ---------------------------------------------------------------

test('assetKey builds {userId}/{uuid}.{ext} with a lowercased extension', () => {
  const key = assetKey(A, 'JPG');
  assert.match(key, /^user_A\/[0-9a-f-]{36}\.jpg$/);
});

test('assetKey accepts every allowlisted extension', () => {
  for (const ext of ['jpg', 'jpeg', 'png', 'webp', 'avif']) {
    assert.match(assetKey(A, ext), new RegExp(`\\.${ext}$`));
  }
});

test('assetKey rejects a disallowed extension', () => {
  assert.throws(() => assetKey(A, 'gif'), /extension/i);
  assert.throws(() => assetKey(A, 'svg'), /extension/i);
});

test('assetKey rejects path-traversal and unsafe userIds', () => {
  assert.throws(() => assetKey('../etc', 'jpg'), /userId/i);
  assert.throws(() => assetKey('a/b', 'jpg'), /userId/i);
  assert.throws(() => assetKey('a b', 'jpg'), /userId/i);
  assert.throws(() => assetKey('', 'jpg'), /userId/i);
});

// --- requestUploadUrl -------------------------------------------------------

test('requestUploadUrl rejects an anonymous caller', () =>
  assertAuthz(
    () => requestUploadUrl(client, anon, { bucket: 'items-raw', ownerId: A, ext: 'jpg', contentType: 'image/jpeg' }),
    'UNAUTHENTICATED',
  ));

test('requestUploadUrl rejects a cross-user upload', () =>
  assertAuthz(
    () => requestUploadUrl(client, ctxA, { bucket: 'items-raw', ownerId: B, ext: 'jpg', contentType: 'image/jpeg' }),
    'FORBIDDEN',
  ));

test('requestUploadUrl rejects an unsupported content type', () =>
  assert.rejects(
    () => requestUploadUrl(client, ctxA, { bucket: 'items-raw', ownerId: A, ext: 'jpg', contentType: 'image/gif' }),
    /content type/i,
  ));

test('requestUploadUrl presigns a PUT for the owner, embedding bucket and key', async () => {
  const result = await requestUploadUrl(client, ctxA, {
    bucket: 'items-raw',
    ownerId: A,
    ext: 'png',
    contentType: 'image/png',
  });
  assert.equal(result.expiresIn, 300);
  assert.match(result.key, /^user_A\/[0-9a-f-]{36}\.png$/);
  assert.match(result.url, /X-Amz-Signature=/);
  assert.match(result.url, /X-Amz-Expires=300/);
  assert.ok(result.url.includes('era-items-raw'), 'URL should target the raw bucket');
  assert.ok(result.url.includes(encodeURIComponent(result.key).replace(/%2F/g, '/')));
});

// --- getAssetUrl ------------------------------------------------------------

test('getAssetUrl returns an unsigned public URL for a public owner cutout (anonymous OK)', async () => {
  const key = `${A}/abc.jpg`;
  const url = await getAssetUrl(client, anon, {
    bucket: 'items-cutout',
    key,
    owner: { userId: A, isPrivate: false },
  });
  assert.equal(url, `https://pub-cutouts.r2.dev/${key}`);
  assert.ok(!url.includes('X-Amz-Signature'), 'public URL must not be signed');
});

test('getAssetUrl returns an unsigned public URL for a public owner outfit cover', async () => {
  const key = `${A}/cover.webp`;
  const url = await getAssetUrl(client, anon, {
    bucket: 'outfit-covers',
    key,
    owner: { userId: A, isPrivate: false },
  });
  assert.equal(url, `https://pub-covers.r2.dev/${key}`);
});

test('getAssetUrl throws for an anonymous read of a raw asset', () =>
  assertAuthz(
    () => getAssetUrl(client, anon, { bucket: 'items-raw', key: `${A}/x.jpg`, owner: { userId: A, isPrivate: false } }),
    'UNAUTHENTICATED',
  ));

test('getAssetUrl throws FORBIDDEN when the key does not match the claimed owner', () =>
  assertAuthz(
    () => getAssetUrl(client, ctxA, { bucket: 'items-raw', key: `${B}/x.jpg`, owner: { userId: A, isPrivate: false } }),
    'FORBIDDEN',
  ));

test('getAssetUrl throws FORBIDDEN for a non-owner reading a private owner cutout', () =>
  assertAuthz(
    () => getAssetUrl(client, ctxB, { bucket: 'items-cutout', key: `${A}/x.jpg`, owner: { userId: A, isPrivate: true } }),
    'FORBIDDEN',
  ));

test('getAssetUrl presigns a GET for the owner of a raw asset, embedding bucket and key', async () => {
  const key = `${A}/photo.jpg`;
  const url = await getAssetUrl(client, ctxA, {
    bucket: 'items-raw',
    key,
    owner: { userId: A, isPrivate: false },
  });
  assert.match(url, /X-Amz-Signature=/);
  assert.match(url, /X-Amz-Expires=300/);
  assert.ok(url.includes('era-items-raw'), 'URL should target the raw bucket');
  assert.ok(url.includes(key));
});

test('getAssetUrl presigns a GET for the owner of a private cutout', async () => {
  const key = `${A}/cutout.png`;
  const url = await getAssetUrl(client, ctxA, {
    bucket: 'items-cutout',
    key,
    owner: { userId: A, isPrivate: true },
  });
  assert.match(url, /X-Amz-Signature=/);
  assert.ok(url.includes('era-items-cutout'), 'URL should target the cutout bucket');
});

// --- deleteUserObjects ------------------------------------------------------
//
// Full-account erasure. These tests never touch live R2: the S3 client's
// `send` is replaced with a scripted double that serves list pages and records
// deletes, so we can assert prefix-safety, pagination, batching, and counts.

interface ListPage {
  Contents: { Key: string }[];
  IsTruncated: boolean;
  NextContinuationToken?: string;
}

/**
 * Build a StorageClient whose S3 `send` answers ListObjectsV2 from `pages`
 * (per bucket, one page per call) and records every deleted key into `deletes`.
 */
function fakeClient(
  pages: Record<string, ListPage[]>,
  listCalls: { Bucket: string; Prefix: string; ContinuationToken?: string }[],
  deletes: Record<string, string[]>,
): StorageClient {
  const cursor: Record<string, number> = {};
  const send = async (command: unknown): Promise<unknown> => {
    if (command instanceof ListObjectsV2Command) {
      const { Bucket, Prefix, ContinuationToken } = command.input;
      listCalls.push({ Bucket: Bucket!, Prefix: Prefix!, ContinuationToken });
      const idx = cursor[Bucket!] ?? 0;
      cursor[Bucket!] = idx + 1;
      return pages[Bucket!]?.[idx] ?? { Contents: [], IsTruncated: false };
    }
    if (command instanceof DeleteObjectsCommand) {
      const { Bucket, Delete } = command.input;
      const keys = (Delete?.Objects ?? []).map((o) => o.Key!);
      (deletes[Bucket!] ??= []).push(...keys);
      return {};
    }
    throw new Error('unexpected S3 command in test');
  };
  return { config, s3: { send } as unknown as StorageClient['s3'] };
}

test('deleteUserObjects refuses an empty or whitespace userId', async () => {
  await assert.rejects(() => deleteUserObjects(client, ''), /empty userId/i);
  await assert.rejects(() => deleteUserObjects(client, '   '), /empty userId/i);
});

test('deleteUserObjects paginates every bucket under the exact userId/ prefix and deletes all keys', async () => {
  const listCalls: { Bucket: string; Prefix: string; ContinuationToken?: string }[] = [];
  const deletes: Record<string, string[]> = {};
  const pages: Record<string, ListPage[]> = {
    'era-items-raw': [
      { Contents: [{ Key: `${A}/1.jpg` }, { Key: `${A}/2.jpg` }], IsTruncated: true, NextContinuationToken: 'tok1' },
      { Contents: [{ Key: `${A}/3.jpg` }], IsTruncated: false },
    ],
    'era-items-cutout': [{ Contents: [{ Key: `${A}/c.png` }], IsTruncated: false }],
    'era-outfit-covers': [{ Contents: [], IsTruncated: false }],
    'era-avatars': [{ Contents: [{ Key: `${A}/a.webp` }], IsTruncated: false }],
  };

  const result = await deleteUserObjects(fakeClient(pages, listCalls, deletes), A);

  // Every list used the exact trailing-slash prefix — never a bare userId.
  assert.ok(listCalls.every((c) => c.Prefix === `${A}/`));
  // The truncated raw bucket was followed to its second page via the token.
  assert.ok(listCalls.some((c) => c.Bucket === 'era-items-raw' && c.ContinuationToken === 'tok1'));
  // 3 raw + 1 cutout + 0 covers + 1 avatar = 5 objects.
  assert.equal(result.deleted, 5);
  assert.equal(result.byBucket['era-items-raw'], 3);
  assert.equal(result.byBucket['era-items-cutout'], 1);
  assert.equal(result.byBucket['era-outfit-covers'], 0);
  assert.equal(result.byBucket['era-avatars'], 1);
  assert.deepEqual(
    [...(deletes['era-items-raw'] ?? [])].sort(),
    [`${A}/1.jpg`, `${A}/2.jpg`, `${A}/3.jpg`],
  );
});

test('deleteUserObjects issues no delete for a user with no objects', async () => {
  const listCalls: { Bucket: string; Prefix: string; ContinuationToken?: string }[] = [];
  const deletes: Record<string, string[]> = {};
  const result = await deleteUserObjects(fakeClient({}, listCalls, deletes), A);
  assert.equal(result.deleted, 0);
  assert.deepEqual(deletes, {});
  // One list call per bucket (all four), each with the safe prefix.
  assert.equal(listCalls.length, 4);
  assert.ok(listCalls.every((c) => c.Prefix === `${A}/`));
});
