/**
 * Tests for the minimal RFC822/MIME extraction in email-receipt.ts.
 *
 * Covers: sender-domain extraction (display-name + angle-addr and bare addr),
 * the multipart walk (alternative + nested mixed), quoted-printable and base64
 * transfer-decoding, latin-1 charset, RFC 2047 subject decoding, and the two
 * throw paths (oversized → too_large, header-less → empty).
 *
 * Run: node --experimental-strip-types --test apps/web/src/lib/email-receipt.test.ts
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';

import { EmailParseError, MAX_EMAIL_BYTES, parseReceiptEmail } from './email-receipt.ts';

test('extracts sender domain, subject, and both bodies from multipart/alternative', () => {
  const raw = [
    'From: ZARA <order@e.zara.com>',
    'Subject: Your order is confirmed',
    'MIME-Version: 1.0',
    'Content-Type: multipart/alternative; boundary="BND1"',
    '',
    '--BND1',
    'Content-Type: text/plain; charset="utf-8"',
    '',
    'Plain body line',
    '--BND1',
    'Content-Type: text/html; charset="utf-8"',
    '',
    '<html><body><p>HTML body</p></body></html>',
    '--BND1--',
    '',
  ].join('\n');

  const email = parseReceiptEmail(raw);
  assert.equal(email.fromDomain, 'e.zara.com');
  assert.equal(email.subject, 'Your order is confirmed');
  assert.match(email.text ?? '', /Plain body line/);
  assert.match(email.html ?? '', /<p>HTML body<\/p>/);
});

test('walks a nested multipart/mixed > multipart/alternative tree', () => {
  const raw = [
    'From: no-reply@mailer.hm.com',
    'Subject: Order',
    'Content-Type: multipart/mixed; boundary="OUTER"',
    '',
    '--OUTER',
    'Content-Type: multipart/alternative; boundary="INNER"',
    '',
    '--INNER',
    'Content-Type: text/plain',
    '',
    'text part',
    '--INNER',
    'Content-Type: text/html',
    '',
    '<div>html part</div>',
    '--INNER--',
    '--OUTER--',
    '',
  ].join('\n');

  const email = parseReceiptEmail(raw);
  assert.equal(email.fromDomain, 'mailer.hm.com'); // bare address, no angle brackets
  assert.match(email.text ?? '', /text part/);
  assert.match(email.html ?? '', /html part/);
});

test('decodes quoted-printable with soft breaks and UTF-8 multibyte escapes', () => {
  const raw = [
    'From: shop@uniqlo.com',
    'Subject: Receipt',
    'Content-Type: text/html; charset="utf-8"',
    'Content-Transfer-Encoding: quoted-printable',
    '',
    '<p>Caf=C3=A9 Blouse =E2=82=AC19,99 with a soft=',
    ' break</p>',
    '',
  ].join('\n');

  const email = parseReceiptEmail(raw);
  assert.match(email.html ?? '', /Café Blouse €19,99/);
  assert.match(email.html ?? '', /soft break/); // soft line break was removed
});

test('decodes a base64 body part', () => {
  const payload = Buffer.from('<p>Hello base64</p>', 'utf8').toString('base64');
  const raw = [
    'From: order@asos.com',
    'Subject: Order',
    'Content-Type: text/html; charset="utf-8"',
    'Content-Transfer-Encoding: base64',
    '',
    payload,
    '',
  ].join('\n');

  const email = parseReceiptEmail(raw);
  assert.match(email.html ?? '', /Hello base64/);
});

test('decodes a latin-1 body', () => {
  const bytes = Buffer.from([0x43, 0x61, 0x66, 0xe9]); // "Café" in ISO-8859-1
  const raw = [
    'From: order@example.com',
    'Content-Type: text/plain; charset="iso-8859-1"',
    '',
    bytes.toString('latin1'),
    '',
  ].join('\n');

  const email = parseReceiptEmail(raw);
  assert.match(email.text ?? '', /Café/);
});

test('decodes an RFC 2047 encoded-word subject', () => {
  const encoded = `=?UTF-8?B?${Buffer.from('Bestätigung', 'utf8').toString('base64')}?=`;
  const raw = ['From: a@b.com', `Subject: ${encoded}`, 'Content-Type: text/plain', '', 'body', ''].join('\n');
  const email = parseReceiptEmail(raw);
  assert.equal(email.subject, 'Bestätigung');
});

test('a single text/html part with no multipart wrapper still yields html', () => {
  const raw = ['From: order@nordstrom.com', 'Subject: Order', 'Content-Type: text/html', '', '<b>hi</b>', ''].join('\n');
  const email = parseReceiptEmail(raw);
  assert.equal(email.fromDomain, 'nordstrom.com');
  assert.match(email.html ?? '', /<b>hi<\/b>/);
  assert.equal(email.text, null);
});

test('rejects an oversized email with EmailParseError(too_large)', () => {
  const raw = `From: a@b.com\n\n${'x'.repeat(MAX_EMAIL_BYTES + 16)}`;
  assert.throws(
    () => parseReceiptEmail(raw),
    (error: unknown) => error instanceof EmailParseError && error.code === 'too_large',
  );
});

test('rejects a header-less email with EmailParseError(empty)', () => {
  assert.throws(
    () => parseReceiptEmail('\n\njust a body, no headers'),
    (error: unknown) => error instanceof EmailParseError && error.code === 'empty',
  );
});
