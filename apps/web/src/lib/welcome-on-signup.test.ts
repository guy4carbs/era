/**
 * Unit tests for the first-sign-in welcome orchestration. No DB and no network:
 * the `profiles` claim UPDATE is a chain fake whose `.returning()` resolves to a
 * caller-chosen row set, and the sender is injected. Covers the idempotency
 * claim (send only when the row was claimed; skip when already stamped) and the
 * best-effort posture (a send error and a DB error are both swallowed).
 *
 * Run: node --experimental-strip-types --test apps/web/src/lib/welcome-on-signup.test.ts
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { DbClient } from '@era/db';

import { sendWelcomeEmailOnSignup } from './welcome-on-signup.ts';
import { type WelcomeEmail } from './send-welcome-email.ts';

/**
 * A DB whose `update().set().where().returning()` resolves to `claimedRows`.
 * `[]` models "already stamped" (the conditional UPDATE claimed nothing); a
 * single row models "we won the claim". `setValues` records the SET payload.
 */
function claimDb(claimedRows: unknown[]): { db: DbClient; setValues: unknown[] } {
  const setValues: unknown[] = [];
  const chain: Record<string, unknown> = {
    update: () => chain,
    set: (value: unknown) => {
      setValues.push(value);
      return chain;
    },
    where: () => chain,
    returning: () => Promise.resolve(claimedRows),
  };
  return { db: chain as unknown as DbClient, setValues };
}

const ARGS = { userId: 'user-1', email: 'new@example.com', url: 'https://era.style' };

test('claims the row and sends exactly once, stamping welcomeEmailSentAt', async () => {
  const { db, setValues } = claimDb([{ userId: 'user-1' }]);
  const sent: WelcomeEmail[] = [];
  const now = new Date('2026-07-06T00:00:00Z');

  await sendWelcomeEmailOnSignup(
    { ...ARGS, db },
    { send: async (email) => void sent.push(email), now: () => now },
  );

  assert.equal(sent.length, 1);
  assert.equal(sent[0]!.to, 'new@example.com');
  assert.equal(sent[0]!.url, 'https://era.style');
  assert.equal(sent[0]!.db, db);
  // The claim stamps the send time.
  assert.deepEqual(setValues, [{ welcomeEmailSentAt: now }]);
});

test('does not send when the welcome was already claimed (returning [])', async () => {
  const { db } = claimDb([]); // conditional UPDATE touched zero rows
  const sent: WelcomeEmail[] = [];

  await sendWelcomeEmailOnSignup({ ...ARGS, db }, { send: async (email) => void sent.push(email) });

  assert.equal(sent.length, 0);
});

test('best-effort: a send failure is swallowed (never throws)', async () => {
  const { db } = claimDb([{ userId: 'user-1' }]);
  const logs: string[] = [];

  await sendWelcomeEmailOnSignup(
    { ...ARGS, db },
    {
      send: async () => {
        throw new Error('resend down');
      },
      log: (m) => logs.push(m),
    },
  );
  // Reaching here without throwing is the assertion; the failure is logged.
  assert.equal(logs.length, 1);
  assert.match(logs[0]!, /welcome email failed/);
});

test('best-effort: a DB claim failure is swallowed and no send is attempted', async () => {
  const chain: Record<string, unknown> = {
    update: () => chain,
    set: () => chain,
    where: () => chain,
    returning: () => Promise.reject(new Error('db offline')),
  };
  const db = chain as unknown as DbClient;
  const sent: WelcomeEmail[] = [];
  const logs: string[] = [];

  await sendWelcomeEmailOnSignup(
    { ...ARGS, db },
    { send: async (email) => void sent.push(email), log: (m) => logs.push(m) },
  );

  assert.equal(sent.length, 0);
  assert.equal(logs.length, 1);
});
