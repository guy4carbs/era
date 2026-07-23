/**
 * Unit tests for the account-deletion email: a render snapshot of the copy, and
 * the send path's suppression gate + transport dormancy. A tiny suppression fake
 * stands in for the DB so we can assert the send is skipped for a suppressed
 * recipient and attempted otherwise.
 *
 * Run: node --experimental-strip-types --test apps/web/src/lib/send-deletion-email.test.ts
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { DbClient } from '@era/db';

import { renderDeletionEmail, sendDeletionEmail } from './send-deletion-email.ts';

/** A DB whose suppression lookup resolves to `rows` (present → suppressed). */
function suppressionDb(rows: unknown[]): DbClient {
  const chain: Record<string, unknown> = {
    select: () => chain,
    from: () => chain,
    where: () => chain,
    limit: () => chain,
    then: (resolve: (r: unknown[]) => unknown, reject: (e: unknown) => unknown) => Promise.resolve(rows).then(resolve, reject),
  };
  return chain as unknown as DbClient;
}

test('renderDeletionEmail: subject, html and text carry the deletion copy', async () => {
  const { subject, html, text } = await renderDeletionEmail();
  assert.equal(subject, 'Your Era account has been deleted');
  assert.ok(html.includes('Taken care of.'), 'html carries the serif headline');
  assert.ok(html.includes('gone for good'));
  assert.ok(html.includes('always welcome back'));
  assert.ok(text.includes('gone for good'));
  assert.ok(text.includes('always welcome back'));
});

test('sendDeletionEmail: real key + not suppressed POSTs the deletion email to Resend', async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const fetchImpl = ((input: unknown, init?: RequestInit) => {
    calls.push({ url: String(input), init });
    return Promise.resolve(new Response('{"id":"x"}', { status: 200 }));
  }) as typeof fetch;

  await sendDeletionEmail(
    { to: 'gone@example.com', db: suppressionDb([]) },
    { env: { RESEND_API_KEY: 're_live_realkey123', NODE_ENV: 'production' }, fetchImpl },
  );

  assert.equal(calls.length, 1);
  assert.equal(calls[0]!.url, 'https://api.resend.com/emails');
  const body = JSON.parse(calls[0]!.init!.body as string);
  assert.equal(body.to, 'gone@example.com');
  assert.equal(body.subject, 'Your Era account has been deleted');
});

test('sendDeletionEmail: suppressed recipient is skipped — never calls fetch', async () => {
  const calls: unknown[] = [];
  const fetchImpl = (() => {
    calls.push(1);
    return Promise.resolve(new Response('{}', { status: 200 }));
  }) as typeof fetch;

  await sendDeletionEmail(
    { to: 'bounced@example.com', db: suppressionDb([{ email: 'bounced@example.com' }]) },
    { env: { RESEND_API_KEY: 're_live_realkey123', NODE_ENV: 'production' }, fetchImpl, log: () => {} },
  );
  assert.equal(calls.length, 0);
});
