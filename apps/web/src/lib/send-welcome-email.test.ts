/**
 * Unit tests for the welcome email: a render snapshot of the copy, and the send
 * path's suppression gate + transport dormancy. A tiny suppression fake stands in
 * for the DB (select-chain resolving to rows) so we can assert the send is skipped
 * for a suppressed recipient and attempted otherwise, mirroring the price-drop
 * email's send tests.
 *
 * Run: node --experimental-strip-types --test apps/web/src/lib/send-welcome-email.test.ts
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { DbClient } from '@era/db';

import { renderWelcomeEmail, sendWelcomeEmail } from './send-welcome-email.ts';

const URL = 'https://era.style/app?welcome=1';

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

test('renderWelcomeEmail: subject, html and text carry the welcome copy and the link', async () => {
  const { subject, html, text } = await renderWelcomeEmail({ url: URL });
  assert.equal(subject, 'Welcome to Era');
  // The serif headline lands first; react-email may entity-encode the apostrophe.
  assert.ok(html.includes('Welcome to your era.'), 'html carries the serif headline');
  assert.ok(html.includes("you're in") || html.includes('you&#x27;re in'), 'html carries the welcome body');
  assert.ok(html.includes('Open Era'), 'html carries the CTA label');
  assert.ok(html.includes(URL), 'html links the CTA at the app url');
  assert.ok(text.includes("you're in"), 'text carries the welcome body');
  assert.ok(text.includes(URL), 'text carries the app url');
});

test('sendWelcomeEmail: real key + not suppressed POSTs the welcome email to Resend', async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const fetchImpl = ((input: unknown, init?: RequestInit) => {
    calls.push({ url: String(input), init });
    return Promise.resolve(new Response('{"id":"x"}', { status: 200 }));
  }) as typeof fetch;

  await sendWelcomeEmail(
    { to: 'new@example.com', url: URL, db: suppressionDb([]) },
    { env: { RESEND_API_KEY: 're_live_realkey123', NODE_ENV: 'production' }, fetchImpl },
  );

  assert.equal(calls.length, 1);
  assert.equal(calls[0]!.url, 'https://api.resend.com/emails');
  const body = JSON.parse(calls[0]!.init!.body as string);
  assert.equal(body.to, 'new@example.com');
  assert.equal(body.subject, 'Welcome to Era');
  assert.ok(body.html.includes(URL));
});

test('sendWelcomeEmail: suppressed recipient is skipped — never calls fetch', async () => {
  const calls: unknown[] = [];
  const fetchImpl = (() => {
    calls.push(1);
    return Promise.resolve(new Response('{}', { status: 200 }));
  }) as typeof fetch;

  await sendWelcomeEmail(
    { to: 'bounced@example.com', url: URL, db: suppressionDb([{ email: 'bounced@example.com' }]) },
    { env: { RESEND_API_KEY: 're_live_realkey123', NODE_ENV: 'production' }, fetchImpl, log: () => {} },
  );
  assert.equal(calls.length, 0);
});
