/**
 * Unit tests for Shop provider selection + the dormant Sovrn adapter — no live
 * feed is touched. `getShopProvider` is driven by env; the Sovrn adapter's
 * network call is exercised with a stubbed global `fetch`, so we assert the
 * ShopSearchQuery → request mapping, the row → ShopProduct mapping (including the
 * UNTAMPERED affiliate URL), the drop rules, and the never-throw failure path.
 *
 * Run: node --experimental-strip-types --test apps/web/src/lib/shop-provider.test.ts
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createSovrnShopProvider, getShopProvider, isRealCredential } from './shop-provider.ts';

/** Save/restore the env keys these tests mutate, so they don't leak across tests. */
function withEnv(overrides: Record<string, string | undefined>, run: () => void | Promise<void>): void | Promise<void> {
  const keys = Object.keys(overrides);
  const saved = keys.map((k) => [k, process.env[k]] as const);
  for (const [k, v] of Object.entries(overrides)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  const restore = (): void => {
    for (const [k, v] of saved) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  };
  try {
    const result = run();
    if (result instanceof Promise) {
      return result.finally(restore);
    }
    restore();
  } catch (error) {
    restore();
    throw error;
  }
}

/** Stub global fetch for one call, restoring it after. Returns the captured URL. */
async function withFetch(
  impl: (url: string) => Response | Promise<Response>,
  run: (captured: { url?: string }) => Promise<void>,
): Promise<void> {
  const original = globalThis.fetch;
  const captured: { url?: string } = {};
  globalThis.fetch = ((input: unknown) => {
    captured.url = String(input);
    return Promise.resolve(impl(captured.url));
  }) as typeof fetch;
  try {
    await run(captured);
  } finally {
    globalThis.fetch = original;
  }
}

// --- isRealCredential --------------------------------------------------------

test('isRealCredential rejects undefined, empty, and placeholder keys', () => {
  assert.equal(isRealCredential(undefined), false);
  assert.equal(isRealCredential(''), false);
  assert.equal(isRealCredential('change-me-affiliate-key'), false);
  assert.equal(isRealCredential('sovrn-xxxx-placeholder'), false);
});

test('isRealCredential accepts a real-looking key', () => {
  assert.equal(isRealCredential('sovrn_live_9f2a7c'), true);
});

// --- getShopProvider selection ----------------------------------------------

test('getShopProvider defaults to the fixture (no provider, no key)', async () => {
  await withEnv({ AFFILIATE_PROVIDER: undefined, AFFILIATE_FEED_KEY: undefined }, async () => {
    let fetched = false;
    const original = globalThis.fetch;
    globalThis.fetch = (() => {
      fetched = true;
      return Promise.reject(new Error('fixture must not hit the network'));
    }) as typeof fetch;
    try {
      const result = await getShopProvider().search({ category: 'top' });
      assert.equal(fetched, false, 'fixture provider must not call fetch');
      assert.ok(result.products.length > 0, 'fixture returns real catalog rows');
      assert.ok(result.products.every((p) => p.category === 'top'));
    } finally {
      globalThis.fetch = original;
    }
  });
});

test('getShopProvider stays on the fixture when provider=sovrn but the key is a placeholder', async () => {
  await withEnv({ AFFILIATE_PROVIDER: 'sovrn', AFFILIATE_FEED_KEY: 'change-me-affiliate-key' }, async () => {
    let fetched = false;
    const original = globalThis.fetch;
    globalThis.fetch = (() => {
      fetched = true;
      return Promise.reject(new Error('placeholder key must not engage the adapter'));
    }) as typeof fetch;
    try {
      const result = await getShopProvider().search({});
      assert.equal(fetched, false, 'placeholder key must NOT engage the Sovrn adapter');
      assert.ok(result.products.length > 0);
    } finally {
      globalThis.fetch = original;
    }
  });
});

test('getShopProvider engages the Sovrn adapter when provider=sovrn AND the key is real', async () => {
  await withEnv({ AFFILIATE_PROVIDER: 'sovrn', AFFILIATE_FEED_KEY: 'sovrn_live_9f2a7c' }, async () => {
    await withFetch(
      () => new Response(JSON.stringify({ products: [] }), { status: 200 }),
      async (captured) => {
        const result = await getShopProvider().search({ q: 'coat' });
        assert.ok(captured.url, 'the Sovrn adapter must call fetch');
        assert.match(captured.url!, /keywords=coat/);
        assert.deepEqual(result.products, []);
      },
    );
  });
});

// --- Sovrn adapter: query mapping -------------------------------------------

test('Sovrn adapter maps query → keywords, price band, page, and the cuid sub-id', async () => {
  const provider = createSovrnShopProvider('sovrn_live_9f2a7c', 'https://api.sovrn.com');
  await withFetch(
    () => new Response(JSON.stringify({ products: [] }), { status: 200 }),
    async (captured) => {
      await provider.search({ q: 'wool', category: 'outerwear', minPrice: 100, maxPrice: 900, page: 2 });
      const url = new URL(captured.url!);
      assert.equal(url.searchParams.get('keywords'), 'wool outerwear');
      assert.equal(url.searchParams.get('minPrice'), '100');
      assert.equal(url.searchParams.get('maxPrice'), '900');
      assert.equal(url.searchParams.get('page'), '2');
      assert.equal(url.searchParams.get('cuid'), 'era');
    },
  );
});

test('Sovrn adapter sends the key only in the Authorization header, never in the URL', async () => {
  const key = 'sovrn_live_secret_abc';
  const provider = createSovrnShopProvider(key, 'https://api.sovrn.com');
  const original = globalThis.fetch;
  let seenAuth: string | null = null;
  let seenUrl = '';
  globalThis.fetch = ((input: unknown, init?: RequestInit) => {
    seenUrl = String(input);
    seenAuth = new Headers(init?.headers).get('authorization');
    return Promise.resolve(new Response(JSON.stringify({ products: [] }), { status: 200 }));
  }) as typeof fetch;
  try {
    await provider.search({ q: 'shirt' });
    assert.equal(seenAuth, `Bearer ${key}`);
    assert.ok(!seenUrl.includes(key), 'the key must never appear in the request URL');
  } finally {
    globalThis.fetch = original;
  }
});

// --- Sovrn adapter: row mapping + drop rules --------------------------------

const GOOD_ROW = {
  id: 'sku-1',
  title: 'Cashmere Overcoat',
  brand: 'Loro Piana',
  price: 1200,
  currency: 'USD',
  imageUrl: 'https://img.example/1.jpg',
  merchant: 'Loro Piana',
  url: 'https://loropiana.example/p/1',
  affiliateUrl: 'https://redirect.sovrn.com/go?u=https%3A%2F%2Floropiana.example%2Fp%2F1&cuid=era&sig=abc123',
  category: 'coats',
  inStock: true,
};

test('Sovrn adapter maps a good row and passes the affiliate URL through UNTAMPERED', async () => {
  const provider = createSovrnShopProvider('sovrn_live_9f2a7c', 'https://api.sovrn.com');
  await withFetch(
    () => new Response(JSON.stringify({ products: [GOOD_ROW] }), { status: 200 }),
    async () => {
      const { products } = await provider.search({});
      assert.equal(products.length, 1);
      const p = products[0]!;
      // The affiliate URL is byte-for-byte what Sovrn returned — never rebuilt.
      assert.equal(p.affiliateUrl, GOOD_ROW.affiliateUrl);
      assert.equal(p.productUrl, GOOD_ROW.url);
      assert.equal(p.title, 'Cashmere Overcoat');
      assert.equal(p.category, 'outerwear'); // 'coats' → outerwear via our map
      assert.equal(p.brandTier, 'luxury'); // 'loro piana' → luxury via our map
      assert.equal(p.retailer, 'Loro Piana');
    },
  );
});

test('Sovrn adapter drops out-of-stock rows and rows missing image/price/url', async () => {
  const provider = createSovrnShopProvider('sovrn_live_9f2a7c', 'https://api.sovrn.com');
  const rows = [
    GOOD_ROW,
    { ...GOOD_ROW, id: 'sku-oos', inStock: false }, // out of stock
    { ...GOOD_ROW, id: 'sku-noimg', imageUrl: undefined }, // missing image
    { ...GOOD_ROW, id: 'sku-noprice', price: undefined }, // missing price
    { ...GOOD_ROW, id: 'sku-nourl', url: undefined, productUrl: undefined }, // missing product url
    { ...GOOD_ROW, id: 'sku-noaff', affiliateUrl: undefined, redirectUrl: undefined }, // missing affiliate url
  ];
  await withFetch(
    () => new Response(JSON.stringify({ products: rows }), { status: 200 }),
    async () => {
      const { products } = await provider.search({});
      assert.equal(products.length, 1, 'only the one complete, in-stock row survives');
      assert.equal(products[0]!.id, 'sku-1');
    },
  );
});

test('Sovrn adapter drops rows whose affiliate/product/image URL is not https (scheme-injection guard)', async () => {
  const provider = createSovrnShopProvider('sovrn_live_9f2a7c', 'https://api.sovrn.com');
  const rows = [
    GOOD_ROW,
    { ...GOOD_ROW, id: 'sku-js', affiliateUrl: 'javascript:alert(document.domain)' }, // hostile href
    { ...GOOD_ROW, id: 'sku-data', imageUrl: 'data:text/html,<script>x</script>' }, // hostile img src
    { ...GOOD_ROW, id: 'sku-http', productUrl: 'http://insecure.example/p/1' }, // plain http
    { ...GOOD_ROW, id: 'sku-tel', affiliateUrl: 'tel:+15551234567' }, // non-web scheme
  ];
  await withFetch(
    () => new Response(JSON.stringify({ products: rows }), { status: 200 }),
    async () => {
      const { products } = await provider.search({});
      assert.equal(products.length, 1, 'only the all-https row survives');
      assert.equal(products[0]!.id, 'sku-1');
    },
  );
});

test('Sovrn adapter defaults unknown brand → contemporary and unknown category → accessory', async () => {
  const provider = createSovrnShopProvider('sovrn_live_9f2a7c', 'https://api.sovrn.com');
  const row = { ...GOOD_ROW, brand: 'Unknown Label', category: 'gizmos' };
  await withFetch(
    () => new Response(JSON.stringify({ products: [row] }), { status: 200 }),
    async () => {
      const { products } = await provider.search({});
      assert.equal(products[0]!.brandTier, 'contemporary');
      assert.equal(products[0]!.category, 'accessory');
    },
  );
});

// --- Sovrn adapter: never throws into the route -----------------------------

test('Sovrn adapter returns an empty result (never throws) on a non-200', async () => {
  const provider = createSovrnShopProvider('sovrn_live_9f2a7c', 'https://api.sovrn.com');
  await withFetch(
    () => new Response('nope', { status: 503 }),
    async () => {
      const result = await provider.search({ page: 3 });
      assert.deepEqual(result, { products: [], page: 3, hasMore: false });
    },
  );
});

test('Sovrn adapter returns an empty result (never throws) on a network error', async () => {
  const provider = createSovrnShopProvider('sovrn_live_9f2a7c', 'https://api.sovrn.com');
  const original = globalThis.fetch;
  globalThis.fetch = (() => Promise.reject(new Error('ECONNRESET'))) as typeof fetch;
  try {
    const result = await provider.search({});
    assert.deepEqual(result, { products: [], page: 1, hasMore: false });
  } finally {
    globalThis.fetch = original;
  }
});

test('Sovrn adapter returns an empty result on a malformed (non-JSON) body', async () => {
  const provider = createSovrnShopProvider('sovrn_live_9f2a7c', 'https://api.sovrn.com');
  await withFetch(
    () => new Response('<html>not json</html>', { status: 200 }),
    async () => {
      const result = await provider.search({});
      assert.deepEqual(result.products, []);
    },
  );
});
