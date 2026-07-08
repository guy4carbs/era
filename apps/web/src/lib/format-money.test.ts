import { test } from 'node:test';
import assert from 'node:assert/strict';

import { formatMoney } from './format-money.ts';

test('formatMoney returns an em dash for non-finite input', () => {
  assert.equal(formatMoney(Number.NaN), '—');
  assert.equal(formatMoney(Number.POSITIVE_INFINITY), '—');
  assert.equal(formatMoney(Number.NEGATIVE_INFINITY), '—');
});

test('formatMoney with a currency renders the symbol and amount', () => {
  const whole = formatMoney(15, 'USD');
  assert.ok(whole.includes('15'), `expected "15" in ${whole}`);
  assert.ok(whole.includes('$'), `expected a "$" in ${whole}`);
});

test('formatMoney drops decimals on whole amounts, keeps cents on fractional', () => {
  // Whole → no fraction digits (e.g. "$15", not "$15.00").
  assert.ok(!formatMoney(15, 'USD').includes('.'), 'whole amount should have no decimal point');
  // Fractional → two fraction digits.
  assert.ok(formatMoney(4.29, 'USD').includes('4.29'), 'fractional amount should keep cents');
  assert.ok(formatMoney(4.5, 'USD').includes('4.50'), 'half amount should pad to two decimals');
});

test('formatMoney without a currency renders a plain number', () => {
  assert.equal(formatMoney(15), '15');
  assert.equal(formatMoney(15, null), '15');
});

test('formatMoney falls back to the plain number for an invalid currency code', () => {
  // "US" is not a 3-letter ISO 4217 code — Intl throws, so we fall back.
  assert.equal(formatMoney(15, 'US'), '15');
});
