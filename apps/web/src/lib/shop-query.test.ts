/**
 * Unit tests for the shared Shop request helpers. Focus: `isHttpsUrl`, the
 * scheme-injection guard that backs BOTH server boundaries (the Sovrn feed mapper
 * and the rank-products product validator), plus the `parseShopQuery` enum/price
 * rules. No network, no DB.
 *
 * Run: node --experimental-strip-types --test apps/web/src/lib/shop-query.test.ts
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { isHttpsUrl, parseShopProduct, parseShopQuery } from './shop-query.ts';

/** A well-formed product card, spread + overridden per case. */
const VALID_PRODUCT = {
  id: 'cos-boxy-tee',
  title: 'Boxy Cotton T-Shirt',
  brand: 'COS',
  brandTier: 'contemporary',
  category: 'top',
  price: 45,
  currency: 'USD',
  imageUrl: 'https://images.cos.example/cos-boxy-tee.jpg',
  retailer: 'COS',
  productUrl: 'https://cos.example/p/cos-boxy-tee',
  affiliateUrl: 'https://cos.example/p/cos-boxy-tee?aff=era-cos',
  sizes: ['S', 'M', 'L'],
  colors: ['white'],
} as const;

test('isHttpsUrl accepts only absolute https URLs', () => {
  assert.equal(isHttpsUrl('https://era.style/p/1'), true);
  assert.equal(isHttpsUrl('https://img.example/a.jpg?x=1&y=2'), true);
});

test('isHttpsUrl rejects hostile and non-https schemes', () => {
  assert.equal(isHttpsUrl('javascript:alert(1)'), false);
  assert.equal(isHttpsUrl('data:text/html,<script>x</script>'), false);
  assert.equal(isHttpsUrl('tel:+15551234567'), false);
  assert.equal(isHttpsUrl('http://insecure.example/p/1'), false); // plain http
  assert.equal(isHttpsUrl('//protocol-relative.example/x'), false);
  assert.equal(isHttpsUrl('/relative/path'), false);
  assert.equal(isHttpsUrl('not a url'), false);
  assert.equal(isHttpsUrl(''), false);
});

test('parseShopQuery accepts a well-formed query and drops blank strings', () => {
  const q = parseShopQuery({ q: '  wool coat  ', category: 'outerwear', brandTier: 'luxury', minPrice: 100, maxPrice: 900, page: 2 });
  assert.deepEqual(q, {
    q: 'wool coat',
    category: 'outerwear',
    brandTier: 'luxury',
    minPrice: 100,
    maxPrice: 900,
    size: undefined,
    page: 2,
  });
});

test('parseShopQuery rejects out-of-enum category/tier, bad price, and inverted band', () => {
  assert.equal(parseShopQuery({ category: 'gizmos' }), null);
  assert.equal(parseShopQuery({ brandTier: 'ultra-lux' }), null);
  assert.equal(parseShopQuery({ minPrice: -5 }), null);
  assert.equal(parseShopQuery({ minPrice: 900, maxPrice: 100 }), null);
  assert.equal(parseShopQuery({ page: 0 }), null);
});

test('parseShopQuery treats an empty body as an all-absent (unfiltered) query', () => {
  const q = parseShopQuery({});
  assert.ok(q);
  assert.equal(q!.q, undefined);
  assert.equal(q!.category, undefined);
});

test('parseShopProduct accepts a well-formed product card', () => {
  const product = parseShopProduct(VALID_PRODUCT);
  assert.ok(product);
  assert.equal(product!.id, 'cos-boxy-tee');
  assert.equal(product!.category, 'top');
  assert.equal(product!.brandTier, 'contemporary');
  assert.equal(product!.price, 45);
  assert.deepEqual(product!.colors, ['white']);
});

test('parseShopProduct rejects a non-https image/link field (scheme-injection guard)', () => {
  for (const field of ['imageUrl', 'productUrl', 'affiliateUrl'] as const) {
    assert.equal(parseShopProduct({ ...VALID_PRODUCT, [field]: 'javascript:alert(1)' }), null, field);
    assert.equal(parseShopProduct({ ...VALID_PRODUCT, [field]: 'http://insecure.example/x' }), null, field);
  }
});

test('parseShopProduct rejects a missing field, bad enum, or bad price', () => {
  assert.equal(parseShopProduct({ ...VALID_PRODUCT, id: '' }), null);
  assert.equal(parseShopProduct({ ...VALID_PRODUCT, title: undefined }), null);
  assert.equal(parseShopProduct({ ...VALID_PRODUCT, category: 'gizmos' }), null);
  assert.equal(parseShopProduct({ ...VALID_PRODUCT, brandTier: 'ultra-lux' }), null);
  assert.equal(parseShopProduct({ ...VALID_PRODUCT, price: -5 }), null);
  assert.equal(parseShopProduct({ ...VALID_PRODUCT, price: 'free' }), null);
  assert.equal(parseShopProduct(null), null);
  assert.equal(parseShopProduct('nope'), null);
});
