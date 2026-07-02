// Server-only R2 storage handle for API routes. Never import from a client bundle.
import { createStorageClient, type StorageClient, type StorageConfig } from '@era/core';

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error('missing required environment variable: ' + name);
  }
  return value;
}

export function serverStorageConfig(): StorageConfig {
  return {
    accountId: required('R2_ACCOUNT_ID'),
    accessKeyId: required('R2_ACCESS_KEY_ID'),
    secretAccessKey: required('R2_SECRET_ACCESS_KEY'),
    buckets: {
      'items-raw': required('R2_BUCKET_ITEMS_RAW'),
      'items-cutout': required('R2_BUCKET_ITEMS_CUTOUT'),
      'outfit-covers': required('R2_BUCKET_OUTFIT_COVERS'),
      avatars: required('R2_BUCKET_AVATARS'),
    },
    publicUrls: {
      'items-cutout': required('R2_PUBLIC_URL_CUTOUTS'),
      'outfit-covers': required('R2_PUBLIC_URL_COVERS'),
    },
  };
}

let cached: StorageClient | null = null;

export function serverStorageClient(): StorageClient {
  cached ??= createStorageClient(serverStorageConfig());
  return cached;
}
