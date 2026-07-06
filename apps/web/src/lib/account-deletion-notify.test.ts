/**
 * Unit tests for the post-deletion side effects. No DB, no network: the deletion
 * sender and audience removal are injected. Covers the happy path (both fire for
 * a captured email), the no-email no-op, and the critical best-effort guarantee
 * — a send failure NEVER throws (so a completed, irreversible deletion is never
 * turned into an error) and still lets the audience removal run.
 *
 * Run: node --experimental-strip-types --test apps/web/src/lib/account-deletion-notify.test.ts
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { DbClient } from '@era/db';

import { notifyAccountDeleted } from './account-deletion-notify.ts';

/** A stand-in DbClient — the injected sender never touches it in these tests. */
const DB = {} as unknown as DbClient;

test('fires the deletion email and the audience removal for a captured email', async () => {
  const emails: string[] = [];
  const removed: string[] = [];

  await notifyAccountDeleted(
    { email: 'gone@example.com', db: DB },
    {
      sendEmail: async ({ to }) => void emails.push(to),
      removeContact: async ({ email }) => void removed.push(email),
    },
  );

  assert.deepEqual(emails, ['gone@example.com']);
  assert.deepEqual(removed, ['gone@example.com']);
});

test('no captured email → no-op (nothing to send or remove)', async () => {
  const emails: string[] = [];
  const removed: string[] = [];

  await notifyAccountDeleted(
    { email: '', db: DB },
    {
      sendEmail: async ({ to }) => void emails.push(to),
      removeContact: async ({ email }) => void removed.push(email),
    },
  );

  assert.equal(emails.length, 0);
  assert.equal(removed.length, 0);
});

test('best-effort: a send failure never throws and the audience removal still runs', async () => {
  const removed: string[] = [];
  const logs: string[] = [];

  await notifyAccountDeleted(
    { email: 'gone@example.com', db: DB },
    {
      sendEmail: async () => {
        throw new Error('resend down');
      },
      removeContact: async ({ email }) => void removed.push(email),
      log: (m) => logs.push(m),
    },
  );

  // The deletion stays successful: this resolved without throwing.
  assert.deepEqual(removed, ['gone@example.com']);
  assert.equal(logs.length, 1);
  assert.match(logs[0]!, /confirmation email failed/);
});
