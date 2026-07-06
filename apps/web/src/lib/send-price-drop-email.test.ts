/**
 * Unit tests for the price-drop email: a render snapshot of the copy, and the
 * send path's dormancy (it inherits the shared transport's activation gate, so
 * we assert only that it wires through — real key → Resend POST carrying the
 * rendered price-drop copy; no key + dev → no fetch).
 *
 * Run: node --experimental-strip-types --test apps/web/src/lib/send-price-drop-email.test.ts
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { renderPriceDropEmail, sendPriceDropEmail, type PriceDropContent } from './send-price-drop-email.ts';

const CONTENT: PriceDropContent = {
  title: 'Wool-blend overcoat',
  brand: 'Acne Studios',
  retailer: 'Ssense',
  oldPrice: 890,
  newPrice: 620,
  currency: 'USD',
  affiliateUrl: 'https://example.com/aff/overcoat?ref=era',
};

test('renderPriceDropEmail: subject, html and text carry the drop details', () => {
  const { subject, html, text } = renderPriceDropEmail(CONTENT);

  // Subject leads with the piece and its new price.
  assert.equal(subject, 'Wool-blend overcoat dropped to $620.00');

  // HTML surfaces the piece, brand, retailer, both prices, the saving, and the link.
  assert.ok(html.includes('Wool-blend overcoat'));
  assert.ok(html.includes('Acne Studios'));
  assert.ok(html.includes('Ssense'));
  assert.ok(html.includes('$620.00'));
  assert.ok(html.includes('$890.00'));
  assert.ok(html.includes('$270.00')); // saved = old - new
  assert.ok(html.includes(CONTENT.affiliateUrl));
  assert.ok(html.includes('View at Ssense'));

  // Plain-text mirror carries the same essentials for text-only clients.
  assert.ok(text.includes('Wool-blend overcoat'));
  assert.ok(text.includes('Now $620.00'));
  assert.ok(text.includes('was $890.00'));
  assert.ok(text.includes(CONTENT.affiliateUrl));
});

test('renderPriceDropEmail: a bad currency code degrades instead of throwing', () => {
  const { subject } = renderPriceDropEmail({ ...CONTENT, currency: 'NOTACODE' });
  assert.ok(subject.includes('NOTACODE 620.00'));
});

test('sendPriceDropEmail: real key POSTs the rendered price-drop email to Resend', async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const fetchImpl = ((input: unknown, init?: RequestInit) => {
    calls.push({ url: String(input), init });
    return Promise.resolve(new Response('{"id":"x"}', { status: 200 }));
  }) as typeof fetch;

  await sendPriceDropEmail(
    { to: 'wardrobe@example.com', ...CONTENT },
    { env: { RESEND_API_KEY: 're_live_realkey123', NODE_ENV: 'production' }, fetchImpl },
  );

  assert.equal(calls.length, 1);
  assert.equal(calls[0]!.url, 'https://api.resend.com/emails');
  const body = JSON.parse(calls[0]!.init!.body as string);
  assert.equal(body.to, 'wardrobe@example.com');
  assert.equal(body.subject, 'Wool-blend overcoat dropped to $620.00');
  assert.ok(body.html.includes(CONTENT.affiliateUrl));
});

test('sendPriceDropEmail: dormant with no key in dev — never calls fetch', async () => {
  const calls: unknown[] = [];
  const fetchImpl = (() => {
    calls.push(1);
    return Promise.resolve(new Response('{}', { status: 200 }));
  }) as typeof fetch;

  await sendPriceDropEmail(
    { to: 'wardrobe@example.com', ...CONTENT },
    { env: { NODE_ENV: 'development' }, fetchImpl, log: () => {} },
  );
  assert.equal(calls.length, 0);
});
