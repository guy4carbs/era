/**
 * Unit tests for the avatar server — the same chainable Proxy fakeDb as
 * turnaround-server.test.ts (records builder calls, dequeues a result set per
 * awaited query). Covers the key-authz validator, the monthly-creation cap, the
 * state read (none + in-flight, no storage), and the claim branches of createAvatar
 * that resolve WITHOUT touching R2 or FASHN (already-creating, already-exists, and
 * a lost failed-retry).
 *
 * The build path (FASHN + R2) is exercised end-to-end elsewhere; here we pin the
 * DB-shaped control flow with no network/storage involvement.
 *
 * Run: node --experimental-strip-types --test apps/web/src/lib/avatar-server.test.ts
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { type AuthContext } from '@era/core';
import { type DbClient, aiUsage, avatars } from '@era/db';

import {
  AVATAR_MONTHLY_CREATE_LIMIT,
  areValidAvatarSourceKeys,
  checkAvatarMonthlyLimit,
  createAvatar,
  getAvatarState,
} from './avatar-server.ts';

interface Call {
  readonly m: string;
  readonly args: readonly unknown[];
}

function fakeDb(resultSets: unknown[][] = []): { db: DbClient; calls: Call[] } {
  const calls: Call[] = [];
  const queue = [...resultSets];
  const chain: Record<string | symbol, unknown> = {
    then: (resolve: (rows: unknown[]) => unknown, reject: (e: unknown) => unknown) => {
      const rows = queue.length > 0 ? (queue.shift() as unknown[]) : [];
      return Promise.resolve(rows).then(resolve, reject);
    },
  };
  const handler: ProxyHandler<Record<string | symbol, unknown>> = {
    get(target, prop) {
      if (prop === 'then') {
        return target.then;
      }
      return (...args: unknown[]) => {
        calls.push({ m: String(prop), args });
        return proxy;
      };
    },
  };
  const proxy = new Proxy(chain, handler);
  return { db: proxy as unknown as DbClient, calls };
}

const ctx: AuthContext = { userId: 'user-1' };
const SRC_KEY = 'user-1/avatar-src/a.png';

test('areValidAvatarSourceKeys accepts 1–3 own-prefixed keys, rejects the rest', () => {
  assert.equal(areValidAvatarSourceKeys('user-1', ['user-1/avatar-src/a.png']), true);
  assert.equal(
    areValidAvatarSourceKeys('user-1', ['user-1/avatar-src/a.png', 'user-1/avatar-src/b.png', 'user-1/avatar-src/c.png']),
    true,
  );
  assert.equal(areValidAvatarSourceKeys('user-1', []), false, 'empty → false');
  assert.equal(
    areValidAvatarSourceKeys('user-1', ['1.png', '2.png', '3.png', '4.png']),
    false,
    'more than 3 → false',
  );
  assert.equal(areValidAvatarSourceKeys('user-1', ['user-2/avatar-src/a.png']), false, 'foreign prefix → false');
  assert.equal(areValidAvatarSourceKeys('user-1', ['user-1/avatar/a.png']), false, 'wrong subdir → false');
  assert.equal(areValidAvatarSourceKeys('user-1', 'not-an-array'), false);
  assert.equal(areValidAvatarSourceKeys('user-1', [42]), false, 'non-string entry → false');
});

test('checkAvatarMonthlyLimit allows below the cap and blocks at it', async () => {
  const under = fakeDb([[{ used: AVATAR_MONTHLY_CREATE_LIMIT - 1 }]]);
  assert.deepEqual(await checkAvatarMonthlyLimit(under.db, 'user-1'), {
    allowed: true,
    used: AVATAR_MONTHLY_CREATE_LIMIT - 1,
    limit: AVATAR_MONTHLY_CREATE_LIMIT,
  });

  const at = fakeDb([[{ used: AVATAR_MONTHLY_CREATE_LIMIT }]]);
  assert.deepEqual(await checkAvatarMonthlyLimit(at.db, 'user-1'), {
    allowed: false,
    used: AVATAR_MONTHLY_CREATE_LIMIT,
    limit: AVATAR_MONTHLY_CREATE_LIMIT,
  });
  // The count query is scoped to the aiUsage table (route/month filters applied inside).
  assert.ok(at.calls.some((c) => c.m === 'from' && c.args[0] === aiUsage));
});

test('getAvatarState maps a missing row to none and an in-flight row without a preview', async () => {
  const none = fakeDb([[]]);
  assert.deepEqual(await getAvatarState(none.db, ctx, 'user-1'), { status: 'none' });

  const createdAt = new Date('2026-07-17T00:00:00.000Z');
  const creating = fakeDb([[{ status: 'creating', baseImagePath: null, createdAt }]]);
  assert.deepEqual(await getAvatarState(creating.db, ctx, 'user-1'), {
    status: 'creating',
    createdAt: createdAt.toISOString(),
    previewUrl: null,
  });
  // A non-ready row never presigns, so the avatars table is only read, never signed.
  assert.ok(creating.calls.some((c) => c.m === 'from' && c.args[0] === avatars));
});

test('createAvatar reports creating when a creation is already in flight', async () => {
  // claim insert → [] (conflict), then existing status read → creating.
  const { db } = fakeDb([[], [{ status: 'creating' }]]);
  assert.deepEqual(await createAvatar(ctx, 'user-1', [SRC_KEY], db), { ok: false, code: 'creating' });
});

test('createAvatar reports already_exists when a ready avatar is present', async () => {
  const { db } = fakeDb([[], [{ status: 'ready' }]]);
  assert.deepEqual(await createAvatar(ctx, 'user-1', [SRC_KEY], db), { ok: false, code: 'already_exists' });
});

test('createAvatar backs off as creating when a failed-row retry is lost to a racer', async () => {
  // claim → [] (conflict); existing → failed; conditional re-claim UPDATE → [] (lost).
  const { db } = fakeDb([[], [{ status: 'failed' }], []]);
  assert.deepEqual(await createAvatar(ctx, 'user-1', [SRC_KEY], db), { ok: false, code: 'creating' });
});
