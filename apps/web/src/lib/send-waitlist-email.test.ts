/**
 * Unit tests for the waitlist-confirmation email: a render snapshot of the copy,
 * and the send path's suppression gate + transport dormancy. A tiny suppression
 * fake stands in for the DB so we can assert the send is skipped for a suppressed
 * recipient and attempted otherwise.
 *
 * Run: node --experimental-strip-types --test apps/web/src/lib/send-waitlist-email.test.ts
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { DbClient } from '@era/db';

import { renderWaitlistEmail, sendWaitlistEmail } from './send-waitlist-email.ts';

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

test('renderWaitlistEmail: subject, html and text carry the gift copy', () => {
  const { subject, html, text } = renderWaitlistEmail();
  // The subject + heading are the gift voice ("You're in."), one line + one link.
  assert.equal(subject, "You're in.");
  assert.ok(html.includes("You're in."));
  assert.ok(html.includes('when your era begins'));
  // The serif heading stack (the sanctioned email stand-in for Fraunces).
  assert.ok(html.includes('Georgia'));
  // The single link points at era.style with the era.style label.
  assert.ok(html.includes('>era.style</a>'));
  // Pricing honesty stays, small, beneath.
  assert.ok(html.includes('Joining is free'));
  assert.ok(text.includes("You're in."));
  assert.ok(text.includes('when your era begins'));
});

test('sendWaitlistEmail: real key + not suppressed POSTs the waitlist email to Resend', async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const fetchImpl = ((input: unknown, init?: RequestInit) => {
    calls.push({ url: String(input), init });
    return Promise.resolve(new Response('{"id":"x"}', { status: 200 }));
  }) as typeof fetch;

  await sendWaitlistEmail(
    { to: 'joiner@example.com', db: suppressionDb([]) },
    { env: { RESEND_API_KEY: 're_live_realkey123', NODE_ENV: 'production' }, fetchImpl },
  );

  assert.equal(calls.length, 1);
  assert.equal(calls[0]!.url, 'https://api.resend.com/emails');
  const body = JSON.parse(calls[0]!.init!.body as string);
  assert.equal(body.to, 'joiner@example.com');
  assert.equal(body.subject, "You're in.");
});

test('sendWaitlistEmail: suppressed recipient is skipped — never calls fetch', async () => {
  const calls: unknown[] = [];
  const fetchImpl = (() => {
    calls.push(1);
    return Promise.resolve(new Response('{}', { status: 200 }));
  }) as typeof fetch;

  await sendWaitlistEmail(
    { to: 'bounced@example.com', db: suppressionDb([{ email: 'bounced@example.com' }]) },
    { env: { RESEND_API_KEY: 're_live_realkey123', NODE_ENV: 'production' }, fetchImpl, log: () => {} },
  );
  assert.equal(calls.length, 0);
});
