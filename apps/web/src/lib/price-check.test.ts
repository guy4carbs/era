/**
 * Unit tests for the price-check engine. No DB and no network are touched — the
 * SSRF-gated fetcher, the price source, and every data-access/delivery seam are
 * injected. Covers: the price math + drop rule, `fetchCurrentPrice` (scrape
 * success/failure → null, Sovrn dormant → null / falls through), the cron secret
 * guard (unconfigured / mismatch / ok), and `runPriceCheck` dispatch (a drop
 * inserts + fans out; no-drop does nothing; per-row isolation; the idempotency
 * rule).
 *
 * Run: node --experimental-strip-types --test apps/web/src/lib/price-check.test.ts
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  authorizeCron,
  fetchCurrentPrice,
  isNewLow,
  runPriceCheck,
  toCents,
  type PriceDropPayload,
  type PriceWatchRow,
} from './price-check.ts';
import { type SafeFetchResult, safeFetch } from './url-import.ts';
import { type SavedProduct } from '@era/db';
import { type PriceDropEmail } from './send-price-drop-email.ts';
import { type ExpoPushMessage } from './expo-push.ts';

// --- fixtures ----------------------------------------------------------------

function savedRow(overrides: Partial<SavedProduct> = {}): SavedProduct {
  return {
    id: 'saved-1',
    userId: 'user-1',
    productId: 'sku-1',
    retailer: 'Ssense',
    title: 'Wool overcoat',
    brand: 'Acne Studios',
    category: 'outerwear',
    imageUrl: 'https://img.example/1.jpg',
    productUrl: 'https://ssense.example/p/1',
    affiliateUrl: 'https://redirect.example/go?u=1',
    currency: 'USD',
    priceSnapshot: '120.00',
    lastPriceCents: null,
    lastCheckedAt: null,
    createdAt: new Date('2026-07-01T00:00:00Z'),
    ...overrides,
  };
}

/** A fake SSRF-gated fetcher returning canned HTML — stands in for `safeFetch`. */
function fakeSafeFetch(html: string, init: { status?: number; contentType?: string } = {}): typeof safeFetch {
  return (async (initialUrl: string): Promise<SafeFetchResult> => {
    const response = new Response(html, {
      status: init.status ?? 200,
      headers: { 'content-type': init.contentType ?? 'text/html; charset=utf-8' },
    });
    return { response, finalUrl: new URL(initialUrl) };
  }) as typeof safeFetch;
}

const PRICE_HTML = (amount: string): string =>
  `<html><head><meta property="product:price:amount" content="${amount}"><meta property="product:price:currency" content="USD"></head><body>x</body></html>`;

// --- price math + drop rule --------------------------------------------------

test('toCents rounds major units to integer cents; rejects junk', () => {
  assert.equal(toCents('96.00'), 9600);
  assert.equal(toCents('120'), 12000);
  assert.equal(toCents(9.99), 999);
  assert.equal(toCents('not a number'), null);
  assert.equal(toCents('-5'), null);
  assert.equal(toCents(undefined), null);
});

test('isNewLow requires below baseline AND below the last observed price', () => {
  // Below the save-time baseline, no prior observation → alert.
  assert.equal(isNewLow(9000, 12000, null), true);
  // Not below baseline → no alert.
  assert.equal(isNewLow(12000, 12000, null), false);
  assert.equal(isNewLow(13000, 12000, null), false);
  // Below baseline but not below the last low → no re-alert (idempotency).
  assert.equal(isNewLow(9000, 12000, 9000), false);
  assert.equal(isNewLow(9500, 12000, 9000), false);
  // A NEW, deeper low → alert again.
  assert.equal(isNewLow(8000, 12000, 9000), true);
});

// --- fetchCurrentPrice -------------------------------------------------------

test('fetchCurrentPrice scrapes the product page and returns cents', async () => {
  const cents = await fetchCurrentPrice(savedRow(), { safeFetchImpl: fakeSafeFetch(PRICE_HTML('96.00')), env: {} });
  assert.equal(cents, 9600);
});

test('fetchCurrentPrice returns null when the page has no price', async () => {
  const cents = await fetchCurrentPrice(savedRow(), {
    safeFetchImpl: fakeSafeFetch('<html><head></head><body>no price here</body></html>'),
    env: {},
  });
  assert.equal(cents, null);
});

test('fetchCurrentPrice returns null on a non-200 or non-HTML response', async () => {
  assert.equal(await fetchCurrentPrice(savedRow(), { safeFetchImpl: fakeSafeFetch('x', { status: 503 }), env: {} }), null);
  assert.equal(
    await fetchCurrentPrice(savedRow(), { safeFetchImpl: fakeSafeFetch('{}', { contentType: 'application/json' }), env: {} }),
    null,
  );
});

test('fetchCurrentPrice returns null when the SSRF-gated fetch throws (blocked/timeout)', async () => {
  const throwing = (async () => {
    throw new Error('blocked');
  }) as typeof safeFetch;
  assert.equal(await fetchCurrentPrice(savedRow(), { safeFetchImpl: throwing, env: {} }), null);
});

test('Sovrn source is dormant: with a real key it still falls through to the scrape', async () => {
  // provider=sovrn + real key engages the (dormant) primary, which yields null,
  // so the scrape fallback runs and returns the scraped price.
  const cents = await fetchCurrentPrice(savedRow(), {
    safeFetchImpl: fakeSafeFetch(PRICE_HTML('80.00')),
    env: { AFFILIATE_PROVIDER: 'sovrn', AFFILIATE_FEED_KEY: 'sovrn_live_real' },
  });
  assert.equal(cents, 8000);
});

// --- authorizeCron -----------------------------------------------------------

function req(secretHeader?: string): Request {
  const headers: Record<string, string> = {};
  if (secretHeader !== undefined) {
    headers['x-cron-secret'] = secretHeader;
  }
  return new Request('http://localhost/api/cron/price-check', { method: 'POST', headers });
}

test('authorizeCron is unconfigured when CRON_SECRET is unset or a placeholder', () => {
  assert.equal(authorizeCron(req('anything'), {}), 'unconfigured');
  assert.equal(authorizeCron(req('anything'), { CRON_SECRET: 'change-me-cron-secret' }), 'unconfigured');
});

test('authorizeCron rejects a missing or wrong secret', () => {
  const env = { CRON_SECRET: 's3cr3t-cron-value' };
  assert.equal(authorizeCron(req(undefined), env), 'unauthorized');
  assert.equal(authorizeCron(req('wrong'), env), 'unauthorized');
  assert.equal(authorizeCron(req('s3cr3t-cron-valuE'), env), 'unauthorized'); // one byte off
});

test('authorizeCron accepts the exact secret', () => {
  assert.equal(authorizeCron(req('s3cr3t-cron-value'), { CRON_SECRET: 's3cr3t-cron-value' }), 'ok');
});

// --- runPriceCheck -----------------------------------------------------------

/** A recording harness over the injectable seams. */
function harness(rows: readonly PriceWatchRow[], currentCents: number | null, tokens: readonly string[] = []) {
  const notifications: Array<{ userId: string; payload: PriceDropPayload }> = [];
  const emails: PriceDropEmail[] = [];
  const pushes: Array<{ tokens: readonly string[]; message: ExpoPushMessage }> = [];
  const checks: Array<{ savedId: string; currentCents: number | null }> = [];
  return {
    notifications,
    emails,
    pushes,
    checks,
    deps: {
      loadRows: async () => rows,
      fetchPrice: async () => currentCents,
      recordCheck: async (savedId: string, cents: number | null) => {
        checks.push({ savedId, currentCents: cents });
      },
      insertNotification: async (userId: string, payload: PriceDropPayload) => {
        notifications.push({ userId, payload });
      },
      loadPushTokens: async () => tokens,
      sendEmail: async (args: PriceDropEmail) => {
        emails.push(args);
      },
      sendPush: async (t: readonly string[], message: ExpoPushMessage) => {
        pushes.push({ tokens: t, message });
      },
      now: () => new Date('2026-07-05T00:00:00Z'),
    },
  };
}

test('a drop inserts an in-app notification and records the check', async () => {
  const row: PriceWatchRow = { saved: savedRow(), emailAlerts: false, pushAlerts: false, userEmail: 'u@e.com' };
  const h = harness([row], 9000); // baseline 12000 → new low
  const summary = await runPriceCheck(h.deps);

  assert.deepEqual(summary, { checked: 1, dropped: 1, alertsSent: 1 });
  assert.equal(h.notifications.length, 1);
  assert.equal(h.notifications[0]!.payload.oldPriceCents, 12000);
  assert.equal(h.notifications[0]!.payload.newPriceCents, 9000);
  assert.equal(h.notifications[0]!.payload.savedProductId, 'saved-1');
  assert.deepEqual(h.checks, [{ savedId: 'saved-1', currentCents: 9000 }]);
  // No email/push channels opted in → none fired.
  assert.equal(h.emails.length, 0);
  assert.equal(h.pushes.length, 0);
});

test('a drop fans out to email and push when those channels are opted in', async () => {
  const row: PriceWatchRow = { saved: savedRow(), emailAlerts: true, pushAlerts: true, userEmail: 'u@e.com' };
  const h = harness([row], 9000, ['ExponentPushToken[x]']);
  const summary = await runPriceCheck(h.deps);

  assert.deepEqual(summary, { checked: 1, dropped: 1, alertsSent: 3 });
  assert.equal(h.emails.length, 1);
  assert.equal(h.emails[0]!.to, 'u@e.com');
  assert.equal(h.emails[0]!.oldPrice, 120);
  assert.equal(h.emails[0]!.newPrice, 90);
  assert.equal(h.pushes.length, 1);
  assert.equal(h.pushes[0]!.tokens.length, 1);
});

test('the db is threaded into the price-drop email args so suppression can fire', async () => {
  const row: PriceWatchRow = { saved: savedRow(), emailAlerts: true, pushAlerts: false, userEmail: 'u@e.com' };
  const h = harness([row], 9000);
  // A sentinel stands in for the DbClient — we only assert it is passed through.
  const sentinelDb = { marker: 'db' } as unknown as import('@era/db').DbClient;
  await runPriceCheck({ ...h.deps, db: sentinelDb });

  assert.equal(h.emails.length, 1);
  assert.equal(h.emails[0]!.db, sentinelDb);
});

test('without a db, the price-drop email args carry db: undefined (suppression no-op)', async () => {
  const row: PriceWatchRow = { saved: savedRow(), emailAlerts: true, pushAlerts: false, userEmail: 'u@e.com' };
  const h = harness([row], 9000);
  await runPriceCheck(h.deps); // no db in deps

  assert.equal(h.emails.length, 1);
  assert.equal(h.emails[0]!.db, undefined);
});

test('push is skipped when the user has no registered tokens (dormant)', async () => {
  const row: PriceWatchRow = { saved: savedRow(), emailAlerts: false, pushAlerts: true, userEmail: 'u@e.com' };
  const h = harness([row], 9000, []); // opted into push but no tokens
  const summary = await runPriceCheck(h.deps);
  assert.equal(summary.alertsSent, 1); // only the in-app card
  assert.equal(h.pushes.length, 0);
});

test('no drop → nothing dispatched, but the check is still recorded', async () => {
  const row: PriceWatchRow = { saved: savedRow(), emailAlerts: true, pushAlerts: true, userEmail: 'u@e.com' };
  const h = harness([row], 13000); // above the 12000 baseline → no drop
  const summary = await runPriceCheck(h.deps);
  assert.deepEqual(summary, { checked: 1, dropped: 0, alertsSent: 0 });
  assert.equal(h.notifications.length, 0);
  assert.deepEqual(h.checks, [{ savedId: 'saved-1', currentCents: 13000 }]);
});

test('idempotency: a price already at the last recorded low does not re-alert', async () => {
  const row: PriceWatchRow = {
    saved: savedRow({ lastPriceCents: 9000 }), // already alerted at 9000
    emailAlerts: false,
    pushAlerts: false,
    userEmail: 'u@e.com',
  };
  const h = harness([row], 9000); // same low again
  const summary = await runPriceCheck(h.deps);
  assert.equal(summary.dropped, 0);
  assert.equal(h.notifications.length, 0);
});

test('a null price records the check and dispatches nothing', async () => {
  const row: PriceWatchRow = { saved: savedRow(), emailAlerts: true, pushAlerts: true, userEmail: 'u@e.com' };
  const h = harness([row], null); // price unavailable
  const summary = await runPriceCheck(h.deps);
  assert.deepEqual(summary, { checked: 1, dropped: 0, alertsSent: 0 });
  assert.deepEqual(h.checks, [{ savedId: 'saved-1', currentCents: null }]);
});

test('one row failing does not fail the batch', async () => {
  const rows: PriceWatchRow[] = [
    { saved: savedRow({ id: 'bad' }), emailAlerts: false, pushAlerts: false, userEmail: 'a@e.com' },
    { saved: savedRow({ id: 'good' }), emailAlerts: false, pushAlerts: false, userEmail: 'b@e.com' },
  ];
  const logs: string[] = [];
  const summary = await runPriceCheck({
    loadRows: async () => rows,
    fetchPrice: async (saved) => (saved.id === 'bad' ? Promise.reject(new Error('boom')) : 9000),
    recordCheck: async () => {},
    insertNotification: async () => {},
    loadPushTokens: async () => [],
    sendEmail: async () => {},
    sendPush: async () => {},
    log: (m) => logs.push(m),
  });
  // Both rows counted as checked; the good one still dropped + alerted.
  assert.equal(summary.checked, 2);
  assert.equal(summary.dropped, 1);
  assert.equal(logs.length, 1);
  assert.match(logs[0]!, /row bad failed/);
});
