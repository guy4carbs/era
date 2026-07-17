/**
 * Unit tests for the try-on server — the same chainable Proxy fakeDb as
 * turnaround-server.test.ts. Covers the flag helper, the pure chain planner
 * (dedup + base-layer XOR + cutout filter + base flags), the staleness signature,
 * the monthly call cap, the state read (none / running / stale-complete, no
 * storage), and the claim branches of runTryon that resolve WITHOUT touching R2 or
 * FASHN (already_running, fresh cache hit, and a lost failed-retry).
 *
 * The chain-execution path (FASHN + R2) is exercised end-to-end elsewhere; here we
 * pin the DB-shaped control flow with no network/storage involvement.
 *
 * Run: node --experimental-strip-types --test apps/web/src/lib/tryon-server.test.ts
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { type AuthContext } from '@era/core';
import { type DbClient, aiUsage } from '@era/db';

import {
  TRYON_MONTHLY_CALL_LIMIT,
  type TryonChainItem,
  checkTryonMonthlyLimit,
  currentTryonSignature,
  getTryonState,
  isTryonEnabledServer,
  planTryonExecution,
  runTryon,
} from './tryon-server.ts';

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

function item(id: string, category: string, layerOrder: number, cutout: string | null): TryonChainItem {
  return { id, category, layerOrder, imageCutoutPath: cutout };
}

test('isTryonEnabledServer is true ONLY for the exact string "true"', () => {
  const original = process.env.ERA_TRYON_ENABLED;
  try {
    delete process.env.ERA_TRYON_ENABLED;
    assert.equal(isTryonEnabledServer(), false, 'unset → off');
    process.env.ERA_TRYON_ENABLED = 'TRUE';
    assert.equal(isTryonEnabledServer(), false, 'wrong case → off');
    process.env.ERA_TRYON_ENABLED = 'true';
    assert.equal(isTryonEnabledServer(), true);
  } finally {
    if (original === undefined) delete process.env.ERA_TRYON_ENABLED;
    else process.env.ERA_TRYON_ENABLED = original;
  }
});

test('planTryonExecution keeps renderable, cutout-backed steps in layer order with base flags', () => {
  const steps = planTryonExecution([
    item('bag', 'bag', 0, 'user-1/bag.png'), // not renderable → dropped
    item('shoes', 'shoes', 0, 'user-1/shoes.png'),
    item('top', 'top', 0, 'user-1/top.png'),
    item('bottom', 'bottom', 0, 'user-1/bottom.png'),
    item('nocut', 'outerwear', 0, null), // renderable but no cutout → dropped
  ]);
  assert.deepEqual(
    steps.map((s) => s.category),
    ['top', 'bottom', 'shoes'],
    'base layers first, then shoes; bag + cutout-less outerwear excluded',
  );
  assert.deepEqual(
    steps.map((s) => s.isBase),
    [true, true, false],
    'top/bottom are base layers, shoes is not',
  );
});

test('planTryonExecution lets a dress win the base layer over top+bottom', () => {
  const steps = planTryonExecution([
    item('dress', 'dress', 0, 'user-1/dress.png'),
    item('top', 'top', 0, 'user-1/top.png'),
    item('bottom', 'bottom', 0, 'user-1/bottom.png'),
  ]);
  assert.deepEqual(
    steps.map((s) => s.category),
    ['dress'],
    'a dress present suppresses the top+bottom base',
  );
});

test('currentTryonSignature is the sorted, colon-joined ids of the rendered set', () => {
  // Only the base pieces render (bag is skipped), so the signature omits it.
  assert.equal(
    currentTryonSignature([
      item('b', 'bottom', 0, 'user-1/b.png'),
      item('a', 'top', 0, 'user-1/a.png'),
      item('z', 'bag', 0, 'user-1/z.png'),
    ]),
    'a:b',
  );
});

test('checkTryonMonthlyLimit reserves the whole chain up front', async () => {
  const under = fakeDb([[{ used: 98 }]]);
  assert.deepEqual(await checkTryonMonthlyLimit(under.db, 'user-1', 2), {
    allowed: true,
    used: 98,
    limit: TRYON_MONTHLY_CALL_LIMIT,
  });

  const over = fakeDb([[{ used: 98 }]]);
  assert.deepEqual(await checkTryonMonthlyLimit(over.db, 'user-1', 3), {
    allowed: false,
    used: 98,
    limit: TRYON_MONTHLY_CALL_LIMIT,
  });
  assert.ok(over.calls.some((c) => c.m === 'from' && c.args[0] === aiUsage));
});

test('getTryonState maps none, in-flight, and stale-complete without presigning', async () => {
  const none = fakeDb([[]]);
  assert.deepEqual(await getTryonState(none.db, ctx, 'outfit-1', 'user-1', 'a:b'), {
    status: 'none',
    imageUrl: null,
    stale: false,
    garmentsRendered: 0,
    garmentsTotal: 0,
  });

  const running = fakeDb([[{ status: 'running', imagePath: null, itemsSignature: 'a:b', garmentsRendered: 0, garmentsTotal: 2 }]]);
  assert.deepEqual(await getTryonState(running.db, ctx, 'outfit-1', 'user-1', 'a:b'), {
    status: 'running',
    imageUrl: null,
    stale: false,
    garmentsRendered: 0,
    garmentsTotal: 2,
  });

  const stale = fakeDb([[{ status: 'complete', imagePath: null, itemsSignature: 'old', garmentsRendered: 2, garmentsTotal: 2 }]]);
  const state = await getTryonState(stale.db, ctx, 'outfit-1', 'user-1', 'new');
  assert.equal(state.status, 'complete');
  assert.equal(state.stale, true, 'signature mismatch → stale');
  assert.equal(state.imageUrl, null, 'a null imagePath never presigns');
});

test('runTryon reports already_running when a render is in flight', async () => {
  const chain = [item('i1', 'top', 0, 'user-1/c1.png')];
  // claim insert → [] (conflict), existing status read → running.
  const { db } = fakeDb([[], [{ status: 'running', itemsSignature: 'i1', imagePath: null }]]);
  assert.deepEqual(await runTryon(ctx, 'user-1', 'outfit-1', 'user-1/avatar/a.png', chain, 'i1', db), {
    ok: false,
    code: 'already_running',
  });
});

test('runTryon returns the cached state on a fresh (non-stale) complete row', async () => {
  const chain = [item('i1', 'top', 0, 'user-1/c1.png')];
  const { db } = fakeDb([
    [], // claim conflict
    [{ status: 'complete', itemsSignature: 'i1', imagePath: null }], // existing, signature matches
    [{ status: 'complete', imagePath: null, itemsSignature: 'i1', garmentsRendered: 1, garmentsTotal: 1 }], // getTryonState read
  ]);
  const result = await runTryon(ctx, 'user-1', 'outfit-1', 'user-1/avatar/a.png', chain, 'i1', db);
  assert.equal(result.ok, true);
  assert.ok(result.ok && result.state.status === 'complete' && result.state.stale === false);
});

test('runTryon backs off as already_running when a failed-row retry is lost', async () => {
  const chain = [item('i1', 'top', 0, 'user-1/c1.png')];
  const { db } = fakeDb([
    [], // claim conflict
    [{ status: 'failed', itemsSignature: 'x', imagePath: null }], // existing failed
    [], // conditional re-claim UPDATE lost
  ]);
  assert.deepEqual(await runTryon(ctx, 'user-1', 'outfit-1', 'user-1/avatar/a.png', chain, 'i1', db), {
    ok: false,
    code: 'already_running',
  });
});
