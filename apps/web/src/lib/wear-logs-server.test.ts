/**
 * Unit tests for the wear-logs server helpers — no live DB. A chainable fake
 * records every query-builder call and dequeues a configured result set per
 * awaited query (mirroring saved-products-server.test.ts's stand-in, extended to
 * serve two sequential selects). The pure validators (parseMonth, isUuid,
 * resolveWearWeather) are asserted directly.
 *
 * Route auth (401 via requireUser) is covered by @era/core's authz tests; the
 * routes reuse that exact guard. These tests cover the pieces the routes lean
 * on: month validation, stats uuid validation, ownership rejection, and that a
 * weather-fetch failure still yields a (null) weather rather than throwing.
 *
 * Run: node --experimental-strip-types --test apps/web/src/lib/wear-logs-server.test.ts
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { type DbClient } from '@era/db';

import {
  isUuid,
  loadItemWearStats,
  loadWearLogsForMonth,
  parseMonth,
  resolveWearWeather,
} from './wear-logs-server.ts';

/** One recorded query-builder call. */
interface Call {
  readonly m: string;
  readonly args: readonly unknown[];
}

/**
 * Chainable Drizzle stand-in: every method records its call and returns the same
 * thenable chain; awaiting the chain dequeues the next configured result set (or
 * `[]` when exhausted), so a helper that runs two selects gets each in order.
 */
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

const UUID = '11111111-1111-4111-8111-111111111111';

test('parseMonth accepts a real YYYY-MM and expands to a half-open range', () => {
  assert.deepEqual(parseMonth('2026-07'), { start: '2026-07-01', endExclusive: '2026-08-01' });
  // December rolls the year over.
  assert.deepEqual(parseMonth('2026-12'), { start: '2026-12-01', endExclusive: '2027-01-01' });
  assert.deepEqual(parseMonth('2026-01'), { start: '2026-01-01', endExclusive: '2026-02-01' });
});

test('parseMonth rejects wrong shapes and impossible months', () => {
  for (const bad of [null, '', '2026', '2026-7', '2026-07-01', '2026-00', '2026-13', 'abcd-ef', '20260-7']) {
    assert.equal(parseMonth(bad as string | null), null, `expected ${String(bad)} to be rejected`);
  }
});

test('isUuid guards the stats itemId', () => {
  assert.equal(isUuid(UUID), true);
  for (const bad of [null, undefined, '', 'not-a-uuid', 123, `${UUID}x`]) {
    assert.equal(isUuid(bad), false);
  }
});

test('resolveWearWeather is null for missing coordinates and never calls the fetcher', async () => {
  let called = false;
  const fetcher = async () => {
    called = true;
    return { tempC: 20, condition: 'clear', description: 'clear sky' };
  };
  assert.equal(await resolveWearWeather(null, null, fetcher), null);
  assert.equal(await resolveWearWeather(41.88, null, fetcher), null);
  assert.equal(called, false);
});

test('resolveWearWeather swallows a fetch failure and returns null', async () => {
  const throwing = async () => {
    throw new Error('network down');
  };
  assert.equal(await resolveWearWeather(41.88, -87.63, throwing), null);
});

test('resolveWearWeather returns the fetched conditions on success', async () => {
  const weather = { tempC: 12.5, condition: 'rain', description: 'rain' };
  const fetcher = async () => weather;
  assert.deepEqual(await resolveWearWeather(41.88, -87.63, fetcher), weather);
});

test('loadItemWearStats returns null when the item is not the caller-owned (ownership rejection)', async () => {
  const { db, calls } = fakeDb([[]]); // no owned row → unknown_item
  const result = await loadItemWearStats(db, 'user-1', UUID);
  assert.equal(result, null);
  // Single owner-scoped query: select → from → where → limit.
  assert.deepEqual(
    calls.map((c) => c.m),
    ['select', 'from', 'where', 'limit'],
  );
});

test('loadItemWearStats returns the wear count + purchase price for an owned item', async () => {
  const { db } = fakeDb([[{ purchasePrice: '129.00', wearCount: 4 }]]);
  const result = await loadItemWearStats(db, 'user-1', UUID);
  assert.deepEqual(result, { wearCount: 4, purchasePrice: '129.00' });
});

test('loadWearLogsForMonth maps logs and fetches the deduped referenced items', async () => {
  const range = { start: '2026-07-01', endExclusive: '2026-08-01' };
  const logRows = [
    { id: 'l1', wornOn: '2026-07-02', outfitId: 'o1', itemIds: [UUID, 'a'], weather: { tempC: 10, condition: 'cloudy', description: 'overcast' }, note: 'chilly' },
    { id: 'l2', wornOn: '2026-07-09', outfitId: null, itemIds: [UUID], weather: null, note: null },
    { id: 'l3', wornOn: '2026-07-15', outfitId: 'o2', itemIds: null, weather: null, note: null },
  ];
  const itemRows = [{ id: UUID, name: 'Wool coat', category: 'outerwear', purchasePrice: '300', imageCutoutPath: null, imageRawPath: null }];
  const { db, calls } = fakeDb([logRows, itemRows]);

  const result = await loadWearLogsForMonth(db, 'user-1', range);

  // Null itemIds becomes an empty array; weather passes through.
  assert.equal(result.logs.length, 3);
  assert.deepEqual(result.logs[1]?.itemIds, [UUID]);
  assert.deepEqual(result.logs[2]?.itemIds, []);
  assert.equal(result.logs[0]?.weather?.condition, 'cloudy');
  assert.deepEqual(result.items, itemRows);
  // Two selects ran: the month logs, then the referenced items.
  assert.equal(calls.filter((c) => c.m === 'select').length, 2);
});

test('loadWearLogsForMonth skips the item query when no logs reference items', async () => {
  const range = { start: '2026-07-01', endExclusive: '2026-08-01' };
  const logRows = [{ id: 'l1', wornOn: '2026-07-02', outfitId: 'o1', itemIds: null, weather: null, note: null }];
  const { db, calls } = fakeDb([logRows]);

  const result = await loadWearLogsForMonth(db, 'user-1', range);

  assert.deepEqual(result.items, []);
  // Only the log query ran — no referenced items to fetch.
  assert.equal(calls.filter((c) => c.m === 'select').length, 1);
});
