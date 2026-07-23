/**
 * Unit tests for the waitlist post-signup side effects. No DB, no network: the
 * email sender and audience add are injected. Covers the new-vs-duplicate gate
 * (a duplicate re-submit sends nothing), the happy path (email + audience add
 * both fire for a new signup), and the best-effort posture (an email failure is
 * swallowed AND still lets the audience add run).
 *
 * Run: node --experimental-strip-types --test apps/web/src/lib/waitlist-signup-notify.test.ts
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { DbClient } from '@era/db';

import { notifyNewWaitlistSignup } from './waitlist-signup-notify.ts';

/** A stand-in DbClient — the injected sender never touches it in these tests. */
const DB = {} as unknown as DbClient;

test('a duplicate signup sends nothing — no email, no audience add', async () => {
  const emails: string[] = [];
  const contacts: string[] = [];

  await notifyNewWaitlistSignup(
    { email: 'dup@example.com', alreadyJoined: true, db: DB },
    {
      sendEmail: async ({ to }) => void emails.push(to),
      addContact: async ({ email }) => void contacts.push(email),
    },
  );

  assert.equal(emails.length, 0);
  assert.equal(contacts.length, 0);
});

test('a new signup fires the confirmation email and the audience add', async () => {
  const emails: string[] = [];
  const contacts: string[] = [];
  const positions: Array<number | undefined> = [];

  await notifyNewWaitlistSignup(
    { email: 'new@example.com', alreadyJoined: false, db: DB, position: 214 },
    {
      sendEmail: async ({ to, position }) => {
        emails.push(to);
        positions.push(position);
      },
      addContact: async ({ email }) => void contacts.push(email),
    },
  );

  assert.deepEqual(emails, ['new@example.com']);
  assert.deepEqual(contacts, ['new@example.com']);
  // The place in line is threaded through to the confirmation email.
  assert.deepEqual(positions, [214]);
});

test('best-effort: an email failure is swallowed and the audience add still runs', async () => {
  const contacts: string[] = [];
  const logs: string[] = [];

  await notifyNewWaitlistSignup(
    { email: 'new@example.com', alreadyJoined: false, db: DB },
    {
      sendEmail: async () => {
        throw new Error('resend down');
      },
      addContact: async ({ email }) => void contacts.push(email),
      log: (m) => logs.push(m),
    },
  );

  assert.deepEqual(contacts, ['new@example.com']); // add ran despite the email throw
  assert.equal(logs.length, 1);
  assert.match(logs[0]!, /confirmation email failed/);
});
