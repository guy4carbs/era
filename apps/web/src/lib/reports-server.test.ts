/**
 * Unit tests for the report server helpers — no live DB. Same chainable Proxy fake
 * as follows-server.test.ts. Covers the daily cap, server-side target resolution
 * (post → creator, denormalized; username → profile; unknown → null), the insert's
 * denormalized shape, and the pre-insert reason-enum guard the route leans on.
 *
 * Run: node --experimental-strip-types --test apps/web/src/lib/reports-server.test.ts
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { isReportReason } from '@era/core/feed';
import { type DbClient, feedPosts, feedReports, profiles, userBlocks } from '@era/db';

import {
  MAX_REPORTS_PER_DAY,
  checkReportLimit,
  createReport,
  resolveReportTarget,
} from './reports-server.ts';

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

test('checkReportLimit counts the caller\'s recent reports and gates at the cap', async () => {
  const under = fakeDb([[{ n: 4 }]]);
  const check = await checkReportLimit(under.db, 'reporter-1');
  assert.equal(check.used, 4);
  assert.equal(check.limit, MAX_REPORTS_PER_DAY);
  assert.equal(check.allowed, true);
  assert.equal(under.calls.find((c) => c.m === 'from')?.args[0], feedReports, 'counts over feed_reports');

  const atCap = fakeDb([[{ n: MAX_REPORTS_PER_DAY }]]);
  assert.equal((await checkReportLimit(atCap.db, 'r')).allowed, false);

  const empty = fakeDb([[]]);
  assert.equal((await checkReportLimit(empty.db, 'r')).used, 0);
});

test('resolveReportTarget resolves a postId to its creator (denormalized) WITHOUT a block gate', async () => {
  const { db, calls } = fakeDb([[{ userId: 'creator-9' }]]);
  const target = await resolveReportTarget(db, { postId: 'p1' });
  assert.deepEqual(target, { reportedUserId: 'creator-9', postId: 'p1' });
  assert.equal(calls.find((c) => c.m === 'from')?.args[0], feedPosts, 'looks up the post');
  // A block must not shield the reported user — one query, no user_blocks read.
  assert.equal(calls.filter((c) => c.m === 'from').length, 1, 'a single post lookup');
  assert.equal(calls.filter((c) => c.args[0] === userBlocks).length, 0, 'no block gate on a report');
});

test('resolveReportTarget resolves a username to its profile, postId null', async () => {
  const { db, calls } = fakeDb([[{ userId: 'owner-2' }]]);
  const target = await resolveReportTarget(db, { username: 'jules' });
  assert.deepEqual(target, { reportedUserId: 'owner-2', postId: null });
  assert.equal(calls.find((c) => c.m === 'from')?.args[0], profiles, 'looks up the profile');
});

test('resolveReportTarget returns null for an unknown post or username', async () => {
  const missingPost = fakeDb([[]]);
  assert.equal(await resolveReportTarget(missingPost.db, { postId: 'ghost' }), null);

  const missingUser = fakeDb([[]]);
  assert.equal(await resolveReportTarget(missingUser.db, { username: 'ghost' }), null);

  // Neither target supplied → null (the route's exactly-one rule also guards this).
  const neither = fakeDb();
  assert.equal(await resolveReportTarget(neither.db, {}), null);
});

test('createReport inserts a row carrying the denormalized reportedUserId and reason', async () => {
  const { db, calls } = fakeDb();
  await createReport(db, {
    reporterId: 'reporter-1',
    reportedUserId: 'creator-9',
    postId: 'p1',
    reason: 'spam',
    detail: 'bot posting',
  });
  assert.equal(calls.find((c) => c.m === 'insert')?.args[0], feedReports, 'insert targets feed_reports');
  assert.deepEqual(calls.find((c) => c.m === 'values')?.args[0], {
    reporterId: 'reporter-1',
    reportedUserId: 'creator-9',
    postId: 'p1',
    reason: 'spam',
    detail: 'bot posting',
  });
});

test('isReportReason rejects a non-enum reason before it can reach the insert', () => {
  assert.equal(isReportReason('spam'), true);
  assert.equal(isReportReason('harassment'), false, 'an off-list reason is rejected pre-insert');
  assert.equal(isReportReason(42), false);
});
