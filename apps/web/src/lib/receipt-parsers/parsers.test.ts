/**
 * Fixture-driven tests for the receipt-parser registry.
 *
 * Each retailer parser is exercised against a hand-authored fixture modeled on
 * that retailer's order-confirmation layout (table-row line items — email HTML is
 * table-based for client compatibility). Also covers: the generic fallback on an
 * unknown retailer, registrable-domain routing (e.zara.com → zara.com), fail-soft
 * on unrecognized markup, the per-receipt item cap, and price sanitization across
 * US/European grouping and currency notation.
 *
 * Run: node --experimental-strip-types --test apps/web/src/lib/receipt-parsers/parsers.test.ts
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { ParsedEmail } from '../email-receipt.ts';
import { parsePrice } from './html.ts';
import { MAX_ITEMS_PER_RECEIPT } from './retailer.ts';
import { parseReceipt, selectParser } from './index.ts';
import { zaraParser } from './zara.ts';
import { hmParser } from './hm.ts';
import { uniqloParser } from './uniqlo.ts';
import { asosParser } from './asos.ts';
import { nordstromParser } from './nordstrom.ts';
import { genericParser } from './generic.ts';

/** Build a ParsedEmail from an html body and a sender domain. */
function email(fromDomain: string, html: string | null, text: string | null = null): ParsedEmail {
  return { fromDomain, subject: 'Order confirmation', html, text };
}

test('Zara: extracts line items with fixed brand, price/currency, image and product URL', () => {
  const html = `
    <table>
      <tr class="order-line">
        <td class="image"><img src="https://static.zara.net/photos/tank.jpg" alt="Tank"></td>
        <td class="product-name"><a href="https://www.zara.com/product/123">Ribbed Tank Top</a></td>
        <td class="price">39.90 GBP</td>
      </tr>
      <tr class="order-line">
        <td class="image"><img src="https://static.zara.net/photos/jeans.jpg" alt="Jeans"></td>
        <td class="product-name">Wide Leg Jeans</td>
        <td class="price">59.90 GBP</td>
      </tr>
      <tr class="totals"><td class="price">Total 99.80 GBP</td></tr>
    </table>`;
  const items = zaraParser.parse(email('e.zara.com', html));
  assert.equal(items.length, 2);
  assert.deepEqual(
    items.map((i) => i.name),
    ['Ribbed Tank Top', 'Wide Leg Jeans'],
  );
  assert.equal(items[0]!.brand, 'Zara');
  assert.equal(items[0]!.price, '39.90');
  assert.equal(items[0]!.currency, 'GBP');
  assert.equal(items[0]!.imageUrl, 'https://static.zara.net/photos/tank.jpg');
  assert.equal(items[0]!.productUrl, 'https://www.zara.com/product/123');
});

test('H&M: single-brand, GBP prices', () => {
  const html = `
    <tr class="hm-product">
      <td><img src="https://lp2.hm.com/hmgoepprod/dress.jpg" alt="Dress"></td>
      <td class="hm-name">Ribbed Jersey Dress</td>
      <td class="hm-price">£24.99</td>
    </tr>`;
  const items = hmParser.parse(email('mailer.hm.com', html));
  assert.equal(items.length, 1);
  assert.equal(items[0]!.name, 'Ribbed Jersey Dress');
  assert.equal(items[0]!.brand, 'H&M');
  assert.equal(items[0]!.price, '24.99');
  assert.equal(items[0]!.currency, 'GBP');
});

test('Uniqlo: single-brand, USD prices', () => {
  const html = `
    <tr class="cart-item">
      <td><img src="https://image.uniqlo.com/tee.jpg" alt="Tee"></td>
      <td class="item-name">Supima Cotton Crew Neck T-Shirt</td>
      <td class="item-price">$14.90</td>
    </tr>`;
  const items = uniqloParser.parse(email('order.uniqlo.com', html));
  assert.equal(items.length, 1);
  assert.equal(items[0]!.brand, 'UNIQLO');
  assert.equal(items[0]!.price, '14.90');
  assert.equal(items[0]!.currency, 'USD');
});

test('ASOS: multi-brand marketplace lifts a per-item brand', () => {
  const html = `
    <tr class="lineItem">
      <td><img src="https://images.asos-media.com/products/tee.jpg" alt="Tee"></td>
      <td class="details"><span class="brand">Nike</span><span class="productTitle">Air Logo T-Shirt</span></td>
      <td class="price">£28.00</td>
    </tr>
    <tr class="lineItem">
      <td><img src="https://images.asos-media.com/products/cap.jpg" alt="Cap"></td>
      <td class="details"><span class="brand">Carhartt WIP</span><span class="productTitle">Logo Cap</span></td>
      <td class="price">£22.00</td>
    </tr>`;
  const items = asosParser.parse(email('asos.com', html));
  assert.equal(items.length, 2);
  assert.equal(items[0]!.brand, 'Nike');
  assert.equal(items[0]!.name, 'Air Logo T-Shirt');
  assert.equal(items[1]!.brand, 'Carhartt WIP');
  assert.equal(items[1]!.price, '22.00');
  assert.equal(items[1]!.currency, 'GBP');
});

test('Nordstrom: department store lifts a per-item brand and USD price', () => {
  const html = `
    <tr class="product-row">
      <td><img src="https://n.nordstrommedia.com/coat.jpg" alt="Coat"></td>
      <td><span class="brand-name">Madewell</span><span class="product-name">Wool Blend Coat</span></td>
      <td><span class="item-price">$168.00</span></td>
    </tr>`;
  const items = nordstromParser.parse(email('nordstrom.com', html));
  assert.equal(items.length, 1);
  assert.equal(items[0]!.brand, 'Madewell');
  assert.equal(items[0]!.name, 'Wool Blend Coat');
  assert.equal(items[0]!.price, '168.00');
  assert.equal(items[0]!.currency, 'USD');
});

test('generic fallback catches an unknown retailer and skips order totals', () => {
  const html = `
    <div class="order">
      <a href="https://bananarepublic.com/p/1"><img src="https://bananarepublic.com/img/shirt.jpg" alt="Shirt"></a>
      <a href="https://bananarepublic.com/p/1">Linen Blend Shirt</a>
      <span>$78.00</span>
      <a href="https://bananarepublic.com/p/2">Pleated Trousers</a>
      <span>$110.00</span>
      <div class="summary">Subtotal $188.00</div>
    </div>`;
  const items = genericParser.parse(email('news@bananarepublic.com', html));
  assert.equal(items.length, 2); // the $188.00 subtotal is filtered out
  assert.deepEqual(
    items.map((i) => i.name),
    ['Linen Blend Shirt', 'Pleated Trousers'],
  );
  assert.equal(items[0]!.price, '78.00');
  assert.equal(items[0]!.currency, 'USD');
  assert.equal(items[1]!.price, '110.00');
});

test('generic fallback reads a text/plain receipt when there is no html', () => {
  const text = ['Thanks for your order!', 'Merino Beanie   $32.00', 'Leather Gloves   $45.00', 'Shipping   $5.00', 'Total   $82.00'].join(
    '\n',
  );
  const items = genericParser.parse(email('hello@smallshop.com', null, text));
  assert.deepEqual(
    items.map((i) => i.name),
    ['Merino Beanie', 'Leather Gloves'],
  );
  assert.equal(items[0]!.price, '32.00');
});

test('registry routes by registrable domain and falls back to generic', () => {
  assert.equal(selectParser('e.zara.com'), zaraParser); // subdomain → zara.com parser
  assert.equal(selectParser('zara.com'), zaraParser);
  assert.equal(selectParser('mail.nordstrom.com'), nordstromParser);
  assert.equal(selectParser('unknown-retailer.com'), genericParser);
});

test('parseReceipt: retailer email routes to its parser', () => {
  const html = `
    <tr class="order-line">
      <td class="product-name">Cropped Blazer</td>
      <td class="price">$89.90</td>
    </tr>`;
  const items = parseReceipt(email('order@e.zara.com'.split('@')[1] ?? '', html));
  assert.equal(items.length, 1);
  assert.equal(items[0]!.brand, 'Zara');
  assert.equal(items[0]!.name, 'Cropped Blazer');
});

test('parseReceipt: wrong-domain non-receipt email yields [] (no throw)', () => {
  const html = '<div><h1>Weekly newsletter</h1><p>Read our style tips.</p></div>';
  assert.deepEqual(parseReceipt(email('newsletter@somebrand.com', html)), []);
});

test('parseReceipt: retailer email with no recognizable items falls back to generic', () => {
  // Zara sender, but the layout is not the Zara table — generic still finds it.
  const html = `
    <div><a href="https://www.zara.com/p/9">Puffer Jacket</a> <span>129,00 EUR</span></div>`;
  const items = parseReceipt(email('e.zara.com', html));
  assert.equal(items.length, 1);
  assert.equal(items[0]!.name, 'Puffer Jacket');
  assert.equal(items[0]!.price, '129.00');
  assert.equal(items[0]!.currency, 'EUR');
});

test('parsers fail soft on unrecognized markup', () => {
  assert.deepEqual(zaraParser.parse(email('e.zara.com', '<div>nothing here</div>')), []);
  assert.deepEqual(hmParser.parse(email('mailer.hm.com', null)), []);
});

test('caps line items at MAX_ITEMS_PER_RECEIPT', () => {
  const rows = Array.from(
    { length: MAX_ITEMS_PER_RECEIPT + 10 },
    (_, i) => `<tr class="order-line"><td class="product-name">Item ${i}</td><td class="price">$${i + 1}.00</td></tr>`,
  ).join('');
  const items = zaraParser.parse(email('e.zara.com', `<table>${rows}</table>`));
  assert.equal(items.length, MAX_ITEMS_PER_RECEIPT);
});

test('parsePrice: US and European grouping + currency notation', () => {
  assert.deepEqual(parsePrice('1.234,56 €'), { price: '1234.56', currency: 'EUR' });
  assert.deepEqual(parsePrice('$1,234.56'), { price: '1234.56', currency: 'USD' });
  assert.deepEqual(parsePrice('£45.00'), { price: '45.00', currency: 'GBP' });
  assert.deepEqual(parsePrice('19,99 €'), { price: '19.99', currency: 'EUR' });
  assert.deepEqual(parsePrice('45,00 €'), { price: '45.00', currency: 'EUR' });
  assert.deepEqual(parsePrice('USD 29.90'), { price: '29.90', currency: 'USD' });
  assert.deepEqual(parsePrice('39.90 GBP'), { price: '39.90', currency: 'GBP' });
});

test('parsePrice: a bare number has no currency; junk yields nothing', () => {
  assert.deepEqual(parsePrice('49.99'), { price: '49.99' });
  assert.deepEqual(parsePrice('no price here'), {});
});
