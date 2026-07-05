/**
 * Unit tests for the AI usage guardrails — no live database is touched. A small
 * chainable fake stands in for the Drizzle client: select/insert builders record
 * what they were handed and resolve to canned rows, so we can assert the query
 * results map correctly without a real Neon connection.
 *
 * Covers: the UTC-day boundary, `allowed` flipping exactly at the limit,
 * `recordUsage`'s cost fallback via `estimateCostUsd` (and its best-effort
 * swallow of a write failure), and `dailySpend` summing per-route rollups.
 *
 * Run: node --experimental-strip-types --test apps/web/src/lib/ai-usage.test.ts
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { DbClient } from '@era/db';

import { checkDailyLimit, dailySpend, recordUsage, utcDayStart } from './ai-usage.ts';

/**
 * A chainable stand-in for the Drizzle client. `selectRows` is what a
 * select-chain resolves to; inserted values are captured on `values`. Set
 * `throwOnInsert` to simulate a write failure. Every builder method returns the
 * same thenable object, so `await` on any chain resolves to `selectRows`.
 */
function fakeDb(selectRows: unknown[] = [], throwOnInsert = false): { db: DbClient; captured: { values?: unknown } } {
  const captured: { values?: unknown } = {};
  const chain: Record<string, unknown> = {
    select: () => chain,
    from: () => chain,
    where: () => chain,
    groupBy: () => chain,
    insert: () => chain,
    values: (v: unknown) => {
      captured.values = v;
      return throwOnInsert ? Promise.reject(new Error('db down')) : Promise.resolve();
    },
    then: (resolve: (rows: unknown[]) => unknown, reject: (e: unknown) => unknown) =>
      Promise.resolve(selectRows).then(resolve, reject),
  };
  return { db: chain as unknown as DbClient, captured };
}

test('utcDayStart returns midnight UTC of the given instant', () => {
  const start = utcDayStart(new Date('2026-07-04T18:45:12.500Z'));
  assert.equal(start.toISOString(), '2026-07-04T00:00:00.000Z');
});

test('utcDayStart uses UTC calendar day, not local — late-UTC instant stays same day', () => {
  // 23:59 UTC on the 4th is still the 4th's window, never rolled to the 5th.
  const start = utcDayStart(new Date('2026-07-04T23:59:59.999Z'));
  assert.equal(start.toISOString(), '2026-07-04T00:00:00.000Z');
});

test('checkDailyLimit: allowed is true below the limit', async () => {
  const { db } = fakeDb([{ used: 49 }]);
  const check = await checkDailyLimit(db, 'user-1', 'ovi-chat');
  assert.equal(check.used, 49);
  assert.equal(check.limit, 50); // ovi-chat default
  assert.equal(check.allowed, true);
  assert.equal(check.route, 'ovi-chat');
});

test('checkDailyLimit: allowed flips to false exactly at the limit', async () => {
  const { db } = fakeDb([{ used: 50 }]);
  const check = await checkDailyLimit(db, 'user-1', 'ovi-chat');
  assert.equal(check.used, 50);
  assert.equal(check.allowed, false);
});

test('checkDailyLimit: treats a missing count row as zero used', async () => {
  const { db } = fakeDb([]);
  const check = await checkDailyLimit(db, 'user-1', 'derive-style-profile');
  assert.equal(check.used, 0);
  assert.equal(check.limit, 20); // derive-style-profile default
  assert.equal(check.allowed, true);
});

test('recordUsage: computes cost from model + tokens when costUsd is omitted', async () => {
  const { db, captured } = fakeDb();
  await recordUsage(db, 'user-1', 'ovi-chat', { model: 'claude-opus-4-8', inputTokens: 1000, outputTokens: 500 });
  const values = captured.values as Record<string, unknown>;
  assert.equal(values.userId, 'user-1');
  assert.equal(values.route, 'ovi-chat');
  assert.equal(values.model, 'claude-opus-4-8');
  assert.equal(values.inputTokens, 1000);
  assert.equal(values.outputTokens, 500);
  // estimateCostUsd('claude-opus-4-8', 1000, 500) === 0.0175, stored as a string.
  assert.equal(values.costUsd, '0.0175');
});

test('recordUsage: null model logs a $0 row (dormant/deterministic path)', async () => {
  const { db, captured } = fakeDb();
  await recordUsage(db, 'user-1', 'process-item', { model: null });
  const values = captured.values as Record<string, unknown>;
  assert.equal(values.model, null);
  assert.equal(values.inputTokens, null);
  assert.equal(values.outputTokens, null);
  assert.equal(values.costUsd, '0');
});

test('recordUsage: an explicit costUsd overrides the estimate', async () => {
  const { db, captured } = fakeDb();
  await recordUsage(db, 'user-1', 'ovi-chat', { model: null, costUsd: 1.25 });
  const values = captured.values as Record<string, unknown>;
  assert.equal(values.costUsd, '1.25');
});

test('recordUsage: swallows a write failure rather than throwing', async () => {
  const { db } = fakeDb([], true);
  await assert.doesNotReject(recordUsage(db, 'user-1', 'ovi-chat', { model: null }));
});

test('dailySpend: sums per-route totals and counts', async () => {
  const { db } = fakeDb([
    { route: 'ovi-chat', totalUsd: '0.0175', count: 3 },
    { route: 'process-item', totalUsd: '0', count: 5 },
    { route: 'derive-style-profile', totalUsd: '0.5', count: 1 },
  ]);
  const spend = await dailySpend(db);
  assert.equal(spend.count, 9);
  assert.equal(spend.totalUsd, 0.5175);
  assert.deepEqual(spend.byRoute, {
    'ovi-chat': 0.0175,
    'process-item': 0,
    'derive-style-profile': 0.5,
  });
});

test('dailySpend: empty day rolls up to zero', async () => {
  const { db } = fakeDb([]);
  const spend = await dailySpend(db, { userId: 'user-1' });
  assert.equal(spend.count, 0);
  assert.equal(spend.totalUsd, 0);
  assert.deepEqual(spend.byRoute, {});
});
