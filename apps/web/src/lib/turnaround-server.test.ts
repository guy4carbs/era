/**
 * Unit tests for the turnaround server — the same chainable Proxy fakeDb as
 * posts-server.test.ts (records builder calls, dequeues a result set per awaited
 * query). Covers the flag helpers, the pure verdict/ordering helpers, the
 * job-based daily cap, the state read (status mapping), and the claim branches of
 * runTurnaround that resolve without touching the network (already_running,
 * idempotent complete, and the defensive no-cutout failure).
 *
 * The generation path (Gemini + Claude + R2) is exercised end-to-end elsewhere;
 * here we pin the DB-shaped control flow with no fetch/SDK involvement.
 *
 * Run: node --experimental-strip-types --test apps/web/src/lib/turnaround-server.test.ts
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { type AuthContext } from '@era/core';
import { type DbClient, type Item, itemAngleRenders, itemTurnaroundJobs } from '@era/db';

import {
  TURNAROUND_DAILY_LIMIT,
  checkTurnaroundDailyLimit,
  coerceVerdict,
  getTurnaroundState,
  isTurnaroundEnabledServer,
  rejectionNote,
  runTurnaround,
  sortRenderRowsByAngle,
  turnaroundCategories,
} from './turnaround-server.ts';

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

/** A minimal item — runTurnaround only reads id, category, imageCutoutPath. */
function fakeItem(overrides: Partial<Item> = {}): Item {
  return { id: 'item-1', userId: 'user-1', category: 'shoes', imageCutoutPath: 'user-1/cut.png', ...overrides } as unknown as Item;
}

test('isTurnaroundEnabledServer is true ONLY for the exact string "true"', () => {
  const original = process.env.ERA_TURNAROUND_ENABLED;
  try {
    delete process.env.ERA_TURNAROUND_ENABLED;
    assert.equal(isTurnaroundEnabledServer(), false, 'unset → off');
    process.env.ERA_TURNAROUND_ENABLED = 'TRUE';
    assert.equal(isTurnaroundEnabledServer(), false, 'wrong case → off');
    process.env.ERA_TURNAROUND_ENABLED = 'true';
    assert.equal(isTurnaroundEnabledServer(), true);
  } finally {
    if (original === undefined) delete process.env.ERA_TURNAROUND_ENABLED;
    else process.env.ERA_TURNAROUND_ENABLED = original;
  }
});

test('turnaroundCategories parses the CSV to a set, or null when unset', () => {
  const original = process.env.ERA_TURNAROUND_CATEGORIES;
  try {
    delete process.env.ERA_TURNAROUND_CATEGORIES;
    assert.equal(turnaroundCategories(), null, 'unset → all categories (null)');
    process.env.ERA_TURNAROUND_CATEGORIES = ' Shoes , , bag ';
    const set = turnaroundCategories();
    assert.ok(set && set.has('shoes') && set.has('bag') && set.size === 2, 'trimmed + lowercased + empties dropped');
  } finally {
    if (original === undefined) delete process.env.ERA_TURNAROUND_CATEGORIES;
    else process.env.ERA_TURNAROUND_CATEGORIES = original;
  }
});

test('sortRenderRowsByAngle orders rows three_quarter → side → back', () => {
  const sorted = sortRenderRowsByAngle([{ angle: 'back' as const }, { angle: 'three_quarter' as const }, { angle: 'side' as const }]);
  assert.deepEqual(
    sorted.map((r) => r.angle),
    ['three_quarter', 'side', 'back'],
  );
});

test('coerceVerdict maps snake_case → verdict, defaults missing booleans false, rejects bad severity', () => {
  assert.deepEqual(
    coerceVerdict({ same_garment: true, angle_matches: true, clean_background: false, artifact_severity: 'minor' }),
    { sameGarment: true, angleMatches: true, cleanBackground: false, artifactSeverity: 'minor' },
  );
  assert.deepEqual(
    coerceVerdict({ artifact_severity: 'none' }),
    { sameGarment: false, angleMatches: false, cleanBackground: false, artifactSeverity: 'none' },
    'missing booleans read as false (conservative)',
  );
  assert.equal(coerceVerdict({ artifact_severity: 'catastrophic' }), null, 'unknown severity → null');
  assert.equal(coerceVerdict(null), null);
});

test('rejectionNote names the first failed gate in priority order', () => {
  assert.equal(rejectionNote({ sameGarment: false, angleMatches: true, cleanBackground: true, artifactSeverity: 'none' }), 'wrong_garment');
  assert.equal(rejectionNote({ sameGarment: true, angleMatches: false, cleanBackground: true, artifactSeverity: 'none' }), 'wrong_angle');
  assert.equal(rejectionNote({ sameGarment: true, angleMatches: true, cleanBackground: true, artifactSeverity: 'major' }), 'major_artifact');
  assert.equal(rejectionNote({ sameGarment: true, angleMatches: true, cleanBackground: false, artifactSeverity: 'minor' }), 'dirty_background');
});

test('checkTurnaroundDailyLimit counts the user\'s jobs and gates at the cap', async () => {
  const under = fakeDb([[{ used: 3 }]]);
  const check = await checkTurnaroundDailyLimit(under.db, 'user-1');
  assert.deepEqual(check, { allowed: true, used: 3, limit: TURNAROUND_DAILY_LIMIT });
  assert.equal(under.calls.find((c) => c.m === 'from')?.args[0], itemTurnaroundJobs, 'counts over item_turnaround_jobs');

  assert.equal((await checkTurnaroundDailyLimit(fakeDb([[]]).db, 'u')).used, 0, 'empty → 0');
  assert.equal((await checkTurnaroundDailyLimit(fakeDb([[{ used: TURNAROUND_DAILY_LIMIT }]]).db, 'u')).allowed, false, 'at the cap is blocked');
});

test('getTurnaroundState maps a missing job to status "none" with no renders', async () => {
  const original = process.env.ERA_TURNAROUND_CATEGORIES;
  delete process.env.ERA_TURNAROUND_CATEGORIES;
  try {
    // job select → [] (none), render select → [] (no accepted renders).
    const { db } = fakeDb([[], []]);
    const state = await getTurnaroundState(db, ctx, 'user-1', 'item-1', 'shoes');
    assert.deepEqual(state, { status: 'none', renders: [], categoryEnabled: true });
  } finally {
    if (original === undefined) delete process.env.ERA_TURNAROUND_CATEGORIES;
    else process.env.ERA_TURNAROUND_CATEGORIES = original;
  }
});

test('getTurnaroundState surfaces a running job and echoes categoryEnabled=false when narrowed out', async () => {
  const original = process.env.ERA_TURNAROUND_CATEGORIES;
  process.env.ERA_TURNAROUND_CATEGORIES = 'bag';
  try {
    const { db } = fakeDb([[{ status: 'running' }], []]);
    const state = await getTurnaroundState(db, ctx, 'user-1', 'item-1', 'shoes');
    assert.equal(state.status, 'running');
    assert.equal(state.categoryEnabled, false, 'shoes is not in {bag}');
    assert.deepEqual(state.renders, []);
  } finally {
    if (original === undefined) delete process.env.ERA_TURNAROUND_CATEGORIES;
    else process.env.ERA_TURNAROUND_CATEGORIES = original;
  }
});

test('runTurnaround returns already_running when the claim conflicts with a live job', async () => {
  // insert…returning → [] (PK conflict), then read existing status → running.
  const { db, calls } = fakeDb([[], [{ status: 'running' }]]);
  const result = await runTurnaround(ctx, 'user-1', fakeItem(), db);
  assert.deepEqual(result, { ok: false, code: 'already_running' });
  assert.equal(calls.find((c) => c.m === 'onConflictDoNothing') !== undefined, true, 'the claim is an insert-onConflict');
});

test('runTurnaround is idempotent on a completed job — returns the current state, no regeneration', async () => {
  const original = process.env.ERA_TURNAROUND_CATEGORIES;
  delete process.env.ERA_TURNAROUND_CATEGORIES;
  try {
    // claim conflict → [], existing status → complete, then getTurnaroundState: job → complete, renders → [].
    const { db, calls } = fakeDb([[], [{ status: 'complete' }], [{ status: 'complete' }], []]);
    const result = await runTurnaround(ctx, 'user-1', fakeItem(), db);
    assert.equal(result.ok, true);
    assert.ok(result.ok && result.state.status === 'complete');
    assert.equal(calls.find((c) => c.m === 'update'), undefined, 'a complete job is never re-claimed/updated');
  } finally {
    if (original === undefined) delete process.env.ERA_TURNAROUND_CATEGORIES;
    else process.env.ERA_TURNAROUND_CATEGORIES = original;
  }
});

test('runTurnaround fails a fresh claim defensively when the item has no cutout', async () => {
  // claim insert → returns the claimed row, then failJob update.
  const { db, calls } = fakeDb([[{ itemId: 'item-1', userId: 'user-1', status: 'running' }], []]);
  const result = await runTurnaround(ctx, 'user-1', fakeItem({ imageCutoutPath: null }), db);
  assert.deepEqual(result, { ok: false, code: 'generation_failed' });
  const update = calls.find((c) => c.m === 'update');
  assert.equal(update?.args[0], itemTurnaroundJobs, 'the job is stamped failed');
  assert.equal(calls.find((c) => c.m === 'insert' && c.args[0] === itemAngleRenders), undefined, 'no render rows are written');
});
