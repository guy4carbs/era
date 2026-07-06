/**
 * Unit tests for the magic-link email helper's dormant-credential activation.
 *
 * No live email is sent: the Resend call is exercised with an injected `fetch`
 * stub, and the env + dev-log sink are injected too, so we assert the full
 * activation truth-table without touching process globals:
 *   - real key           → attempts a Resend send (dev AND prod)
 *   - real key + non-2xx → throws, and the message leaks neither url nor key
 *   - no key + prod      → throws 'email provider not wired yet', no fetch
 *   - no key + dev       → logs the exact greppable line, no fetch
 *   - placeholder key    → treated as absent (dev logs / prod throws)
 *
 * Run: node --experimental-strip-types --test apps/web/src/lib/send-magic-link-email.test.ts
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { isRealCredential, sendMagicLinkEmail } from './send-magic-link-email.ts';

const EMAIL = 'wardrobe@example.com';
const URL = 'https://era.style/api/auth/magic-link/verify?token=SECRET_TOKEN_abc123';
const REAL_KEY = 're_live_realkey123';
// The email links at the confirm interstitial, carrying the verify URL as an
// encoded `next` — never straight at the raw verify endpoint (a link prefetch
// there would burn the single-use token). Host-agnostic so it holds regardless
// of NEXT_PUBLIC_SITE_URL in the test environment.
const CONFIRM_LINK = `/sign-in/confirm?next=${encodeURIComponent(URL)}`;

/** A fetch stub that records its calls and returns a canned Response. */
function stubFetch(status = 200): { fetch: typeof fetch; calls: Array<{ url: string; init?: RequestInit }> } {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const fetchImpl = ((input: unknown, init?: RequestInit) => {
    calls.push({ url: String(input), init });
    return Promise.resolve(new Response(status < 300 ? '{"id":"x"}' : 'upstream error', { status }));
  }) as typeof fetch;
  return { fetch: fetchImpl, calls };
}

/** A log sink that records the lines written to it. */
function stubLog(): { log: (m: string) => void; lines: string[] } {
  const lines: string[] = [];
  return { log: (m) => lines.push(m), lines };
}

test('real key: sends via Resend in production', async () => {
  const { fetch, calls } = stubFetch(200);
  await sendMagicLinkEmail({ email: EMAIL, url: URL }, { env: { RESEND_API_KEY: REAL_KEY, NODE_ENV: 'production' }, fetchImpl: fetch });

  assert.equal(calls.length, 1);
  assert.equal(calls[0]!.url, 'https://api.resend.com/emails');
  const init = calls[0]!.init!;
  assert.equal(init.method, 'POST');
  const headers = init.headers as Record<string, string>;
  assert.equal(headers.Authorization, `Bearer ${REAL_KEY}`);
  const body = JSON.parse(init.body as string);
  assert.equal(body.to, EMAIL);
  assert.equal(body.from, 'Era <hello@era.style>'); // default when EMAIL_FROM unset
  assert.ok(body.html.includes(CONFIRM_LINK), 'html links to the confirm interstitial');
  assert.ok(body.text.includes(CONFIRM_LINK), 'text links to the confirm interstitial');
  // Defense: the raw verify URL is never a bare link target in the email.
  assert.ok(!body.html.includes(`href="${URL}"`), 'must not link straight at verify');
});

test('real key: also sends in dev, and honours EMAIL_FROM override', async () => {
  const { fetch, calls } = stubFetch(200);
  const log = stubLog();
  await sendMagicLinkEmail(
    { email: EMAIL, url: URL },
    { env: { RESEND_API_KEY: REAL_KEY, EMAIL_FROM: 'Era Team <team@era.style>', NODE_ENV: 'development' }, fetchImpl: fetch, log: log.log },
  );

  assert.equal(calls.length, 1);
  assert.equal(JSON.parse(calls[0]!.init!.body as string).from, 'Era Team <team@era.style>');
  assert.equal(log.lines.length, 0); // sent, not dev-logged
});

test('real key: a non-2xx Resend response throws WITHOUT leaking the url or key', async () => {
  const { fetch } = stubFetch(422);
  await assert.rejects(
    sendMagicLinkEmail({ email: EMAIL, url: URL }, { env: { RESEND_API_KEY: REAL_KEY, NODE_ENV: 'production' }, fetchImpl: fetch }),
    (error: Error) => {
      assert.ok(!error.message.includes(URL), 'error must not contain the magic-link url');
      assert.ok(!error.message.includes('SECRET_TOKEN'), 'error must not contain the token');
      assert.ok(!error.message.includes(REAL_KEY), 'error must not contain the api key');
      assert.match(error.message, /status 422/);
      return true;
    },
  );
});

test('no key + production: throws loudly and never calls fetch', async () => {
  const { fetch, calls } = stubFetch(200);
  await assert.rejects(
    sendMagicLinkEmail({ email: EMAIL, url: URL }, { env: { NODE_ENV: 'production' }, fetchImpl: fetch }),
    /email provider not wired yet/,
  );
  assert.equal(calls.length, 0);
});

test('no key + dev: logs the exact greppable line and never calls fetch', async () => {
  const { fetch, calls } = stubFetch(200);
  const log = stubLog();
  await sendMagicLinkEmail({ email: EMAIL, url: URL }, { env: { NODE_ENV: 'development' }, fetchImpl: fetch, log: log.log });

  assert.equal(calls.length, 0);
  assert.deepEqual(log.lines, [`[era-auth] magic link for ${EMAIL}: ${URL}`]);
});

test('placeholder key is treated as absent (dev logs, prod throws)', async () => {
  const { fetch, calls } = stubFetch(200);
  const log = stubLog();
  // change-me-… placeholder → dev logs, no send.
  await sendMagicLinkEmail(
    { email: EMAIL, url: URL },
    { env: { RESEND_API_KEY: 'change-me-resend-api-key', NODE_ENV: 'development' }, fetchImpl: fetch, log: log.log },
  );
  assert.equal(calls.length, 0);
  assert.deepEqual(log.lines, [`[era-auth] magic link for ${EMAIL}: ${URL}`]);

  // same placeholder in prod → throws.
  await assert.rejects(
    sendMagicLinkEmail({ email: EMAIL, url: URL }, { env: { RESEND_API_KEY: 'change-me-resend-api-key', NODE_ENV: 'production' }, fetchImpl: fetch }),
    /email provider not wired yet/,
  );
});

test('isRealCredential rejects empty and change-me placeholders', () => {
  assert.equal(isRealCredential(undefined), false);
  assert.equal(isRealCredential(''), false);
  assert.equal(isRealCredential('change-me-resend-api-key'), false);
  assert.equal(isRealCredential('re_live_realkey123'), true);
});
