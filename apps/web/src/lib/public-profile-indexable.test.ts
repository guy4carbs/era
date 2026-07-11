/**
 * Unit test for {@link listIndexableProfiles} — the sitemap's public/non-thin
 * query. A chainable fake db (mirrors public-profile-server.test.ts) returns one
 * configured result set; we assert the username + lastModified mapping, including
 * the null-createdAt fallback to "now".
 *
 * Run: node --experimental-strip-types --test apps/web/src/lib/public-profile-indexable.test.ts
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { type DbClient } from '@era/db';

import { listIndexableProfiles } from './public-profile-server.ts';

/** Queue-driven Drizzle stand-in: each awaited chain dequeues one result set. */
function fakeDb(resultSets: unknown[][] = []): DbClient {
  const queue = [...resultSets];
  const chain: Record<string | symbol, unknown> = {
    then: (resolve: (rows: unknown[]) => unknown, reject: (e: unknown) => unknown) => {
      const rows = queue.length > 0 ? (queue.shift() as unknown[]) : [];
      return Promise.resolve(rows).then(resolve, reject);
    },
  };
  const proxy: unknown = new Proxy(chain, {
    get(target, prop) {
      if (prop === 'then') return target.then;
      return () => proxy;
    },
  });
  return proxy as DbClient;
}

test('listIndexableProfiles maps rows to sitemap entries', async () => {
  const created = new Date('2026-06-01T00:00:00.000Z');
  const db = fakeDb([
    [
      { username: 'mara', createdAt: created },
      { username: 'jules', createdAt: null },
    ],
  ]);

  const before = Date.now();
  const rows = await listIndexableProfiles(db, 5000);
  const after = Date.now();

  assert.equal(rows.length, 2);
  assert.deepEqual(rows[0], { username: 'mara', updatedAt: created });

  // A null createdAt falls back to "now" so lastModified is always a valid Date.
  assert.equal(rows[1]?.username, 'jules');
  const fallback = rows[1]?.updatedAt.getTime() ?? 0;
  assert.ok(fallback >= before && fallback <= after, 'null createdAt falls back to now');
});

test('listIndexableProfiles returns [] when no profiles qualify', async () => {
  const rows = await listIndexableProfiles(fakeDb([[]]), 5000);
  assert.deepEqual(rows, []);
});
