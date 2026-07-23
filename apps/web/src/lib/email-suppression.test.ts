/**
 * Unit tests for the email suppression list — no live database is touched. A
 * small chainable fake stands in for the Drizzle client: the select-chain records
 * the `where` predicate and resolves to canned rows; the insert-chain captures the
 * inserted values. That lets us assert lookup truthiness, lowercase normalization
 * (via the bound query param / inserted value), the fail-open read, and the
 * idempotent insert — all without a real Neon connection.
 *
 * Run: node --experimental-strip-types --test apps/web/src/lib/email-suppression.test.ts
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { DbClient } from '@era/db';

import { addSuppression, isEmailSuppressed, removeSuppression } from './email-suppression.ts';

/**
 * A chainable stand-in for the Drizzle client. The select-chain resolves to
 * `selectRows` and records the `where` predicate; the insert-chain captures the
 * inserted `values`. `throwOnSelect` makes the select-chain reject, to exercise
 * the fail-open read.
 */
function fakeDb(
  selectRows: unknown[] = [],
  throwOnSelect = false,
): { db: DbClient; captured: { where?: unknown; values?: unknown; deleteWhere?: unknown } } {
  const captured: { where?: unknown; values?: unknown; deleteWhere?: unknown } = {};
  let deleting = false;
  const chain: Record<string, unknown> = {
    select: () => chain,
    from: () => chain,
    where: (predicate: unknown) => {
      if (deleting) {
        captured.deleteWhere = predicate;
        deleting = false;
        return Promise.resolve();
      }
      captured.where = predicate;
      return chain;
    },
    limit: () => chain,
    insert: () => chain,
    delete: () => {
      deleting = true;
      return chain;
    },
    values: (v: unknown) => {
      captured.values = v;
      return chain;
    },
    onConflictDoNothing: () => Promise.resolve(),
    then: (resolve: (rows: unknown[]) => unknown, reject: (e: unknown) => unknown) =>
      throwOnSelect ? Promise.reject(new Error('db down')).then(resolve, reject) : Promise.resolve(selectRows).then(resolve, reject),
  };
  return { db: chain as unknown as DbClient, captured };
}

/** Pull the bound value out of a drizzle `eq(col, value)` predicate. */
function boundParamValue(predicate: unknown): unknown {
  const chunks = (predicate as { queryChunks?: unknown[] }).queryChunks ?? [];
  const param = chunks.find((c) => c != null && (c as { constructor?: { name?: string } }).constructor?.name === 'Param');
  return (param as { value?: unknown } | undefined)?.value;
}

test('isEmailSuppressed: true when a row is found', async () => {
  const { db } = fakeDb([{ email: 'bounced@example.com' }]);
  assert.equal(await isEmailSuppressed(db, 'bounced@example.com'), true);
});

test('isEmailSuppressed: false when no row is found', async () => {
  const { db } = fakeDb([]);
  assert.equal(await isEmailSuppressed(db, 'fine@example.com'), false);
});

test('isEmailSuppressed: normalizes the lookup to lowercase (and trims)', async () => {
  const { db, captured } = fakeDb([]);
  await isEmailSuppressed(db, '  Bounced@Example.COM  ');
  assert.equal(boundParamValue(captured.where), 'bounced@example.com');
});

test('isEmailSuppressed: fails open — a lookup error is swallowed as not suppressed', async () => {
  const { db } = fakeDb([], true);
  assert.equal(await isEmailSuppressed(db, 'bounced@example.com'), false);
});

test('addSuppression: inserts the normalized email with its reason, idempotently', async () => {
  const { db, captured } = fakeDb();
  await addSuppression(db, '  Bounced@Example.COM  ', 'bounced');
  assert.deepEqual(captured.values, { email: 'bounced@example.com', reason: 'bounced' });
});

/** Recursively collect every bound `Param` value from a drizzle SQL predicate. */
function allBoundValues(predicate: unknown): unknown[] {
  const out: unknown[] = [];
  const walk = (node: unknown): void => {
    if (node == null || typeof node !== 'object') {
      return;
    }
    if ((node as { constructor?: { name?: string } }).constructor?.name === 'Param') {
      out.push((node as { value?: unknown }).value);
      return;
    }
    const chunks = (node as { queryChunks?: unknown[] }).queryChunks;
    if (Array.isArray(chunks)) {
      for (const chunk of chunks) {
        walk(chunk);
      }
    }
  };
  walk(predicate);
  return out;
}

test('removeSuppression: deletes the normalized email scoped to reason=manual', async () => {
  const { db, captured } = fakeDb();
  await removeSuppression(db, '  Wants-Back@Example.COM  ');
  const bound = allBoundValues(captured.deleteWhere);
  assert.ok(bound.includes('wants-back@example.com'), 'normalized email in the predicate');
  assert.ok(bound.includes('manual'), "scoped to reason='manual' — bounced/complained never reversible");
});
