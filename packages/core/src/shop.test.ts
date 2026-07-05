import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  createFixtureShopProvider,
  fixtureCatalog,
  rankProducts,
  BUDGET_BANDS,
  SIZE_OPTIONS,
  BRAND_TIER_ORDER,
  budgetBandToQuery,
  type BrandTier,
  type ItemCategory,
  type ShopProduct,
} from './shop.ts';
import type { OviItem, StyleProfileLite } from './ovi.ts';

// --- fixtures ----------------------------------------------------------------

/** Build a ShopProduct with sensible defaults; override what a test cares about. */
function product(partial: Partial<ShopProduct> & Pick<ShopProduct, 'id' | 'category'>): ShopProduct {
  return {
    title: partial.id,
    brand: 'Test Brand',
    brandTier: 'contemporary',
    price: 100,
    currency: 'USD',
    imageUrl: `https://img.example/${partial.id}.jpg`,
    retailer: 'Test Brand',
    productUrl: `https://test.example/p/${partial.id}`,
    affiliateUrl: `https://test.example/p/${partial.id}?aff=era-test`,
    colors: [],
    sizes: [],
    ...partial,
  };
}

/** Build an owned OviItem with defaults; override what a test cares about. */
function owned(partial: Partial<OviItem> & Pick<OviItem, 'id' | 'category'>): OviItem {
  return { colors: [], pattern: null, brand: null, ...partial };
}

/** First element of a list, asserting it is non-empty (satisfies strict indexing). */
function first<T>(items: readonly T[]): T {
  const [head] = items;
  assert.ok(head, 'expected a non-empty result');
  return head;
}

const ALL_TIERS: readonly BrandTier[] = ['luxury', 'premium', 'contemporary', 'high_street'];
const ALL_CATEGORIES: readonly ItemCategory[] = [
  'top',
  'bottom',
  'dress',
  'outerwear',
  'shoes',
  'bag',
  'hat',
  'scarf',
  'watch',
  'jewelry',
  'accessory',
];

// --- fixture catalog integrity -----------------------------------------------

test('fixture catalog spans every tier and every category', () => {
  const catalog = fixtureCatalog();
  assert.ok(catalog.length >= 45, 'expected a substantial curated catalog');

  const tiers = new Set(catalog.map((p) => p.brandTier));
  for (const tier of ALL_TIERS) {
    assert.ok(tiers.has(tier), `missing brand tier: ${tier}`);
  }

  const categories = new Set(catalog.map((p) => p.category));
  for (const category of ALL_CATEGORIES) {
    assert.ok(categories.has(category), `missing category: ${category}`);
  }
});

test('every fixture has a $30–$1200 price and a placeholder affiliate deep-link', () => {
  for (const p of fixtureCatalog()) {
    assert.ok(p.price >= 30 && p.price <= 1200, `${p.id} price out of range: ${p.price}`);
    assert.equal(p.currency, 'USD');
    assert.ok(p.affiliateUrl.includes('?aff=era-'), `${p.id} missing affiliate tag`);
    assert.notEqual(p.affiliateUrl, p.productUrl, `${p.id} affiliate url must differ from raw url`);
  }
});

test('fixture ids are unique', () => {
  const ids = fixtureCatalog().map((p) => p.id);
  assert.equal(new Set(ids).size, ids.length, 'duplicate fixture id');
});

// --- fixture provider: search, filters, pagination ---------------------------

test('fixture provider paginates with a page size of 20', async () => {
  const provider = createFixtureShopProvider();
  const total = fixtureCatalog().length;

  const page1 = await provider.search({});
  assert.equal(page1.page, 1);
  assert.equal(page1.products.length, 20);
  assert.equal(page1.hasMore, true);

  const page2 = await provider.search({ page: 2 });
  assert.equal(page2.page, 2);
  assert.equal(page2.products.length, 20);

  const lastPage = await provider.search({ page: 3 });
  assert.equal(lastPage.products.length, total - 40);
  assert.equal(lastPage.hasMore, false);

  // Pages don't overlap.
  const seen = new Set([...page1.products, ...page2.products, ...lastPage.products].map((p) => p.id));
  assert.equal(seen.size, total);
});

test('fixture provider clamps a non-positive page to page 1', async () => {
  const provider = createFixtureShopProvider();
  const first = await provider.search({});
  const clamped = await provider.search({ page: 0 });
  assert.equal(clamped.page, 1);
  assert.deepEqual(
    clamped.products.map((p) => p.id),
    first.products.map((p) => p.id),
  );
});

test('fixture provider filters by category', async () => {
  const provider = createFixtureShopProvider();
  const res = await provider.search({ category: 'shoes' });
  assert.ok(res.products.length > 0);
  assert.ok(res.products.every((p) => p.category === 'shoes'));
});

test('fixture provider filters by brand tier', async () => {
  const provider = createFixtureShopProvider();
  const res = await provider.search({ brandTier: 'luxury' });
  assert.ok(res.products.length > 0);
  assert.ok(res.products.every((p) => p.brandTier === 'luxury'));
});

test('fixture provider filters by price range (inclusive)', async () => {
  const provider = createFixtureShopProvider();
  const res = await provider.search({ minPrice: 100, maxPrice: 300 });
  assert.ok(res.products.length > 0);
  assert.ok(res.products.every((p) => p.price >= 100 && p.price <= 300));
});

test('fixture provider filters by q substring across title and brand', async () => {
  const provider = createFixtureShopProvider();
  const byBrand = await provider.search({ q: 'uniqlo' });
  assert.ok(byBrand.products.length > 0);
  assert.ok(byBrand.products.every((p) => p.brand.toLowerCase().includes('uniqlo')));

  const byTitle = await provider.search({ q: 'jean' });
  assert.ok(byTitle.products.length > 0);
  assert.ok(byTitle.products.every((p) => p.title.toLowerCase().includes('jean')));
});

test('fixture provider filters by size', async () => {
  const provider = createFixtureShopProvider();
  const res = await provider.search({ size: 'XL' });
  assert.ok(res.products.length > 0);
  assert.ok(res.products.every((p) => (p.sizes ?? []).some((s) => s.toLowerCase() === 'xl')));
});

test('fixture provider combines filters', async () => {
  const provider = createFixtureShopProvider();
  const res = await provider.search({ category: 'top', brandTier: 'high_street' });
  assert.ok(res.products.length > 0);
  assert.ok(res.products.every((p) => p.category === 'top' && p.brandTier === 'high_street'));
});

// --- ranker: fills_gap -------------------------------------------------------

const NO_PROFILE: StyleProfileLite | null = null;

test('rankProducts flags the biggest missing essential as fills_gap', () => {
  // Closet owns a top, a bottom, and outerwear but no shoes → gap is shoes.
  const closet = [
    owned({ id: 't1', category: 'top' }),
    owned({ id: 'b1', category: 'bottom' }),
    owned({ id: 'o1', category: 'outerwear' }),
  ];
  const shoe = product({ id: 'shoe', category: 'shoes' });
  const bag = product({ id: 'bag', category: 'bag' });

  const ranked = first(rankProducts([shoe, bag], closet, NO_PROFILE).filter((p) => p.id === 'shoe'));
  assert.ok(ranked.why);
  assert.equal(ranked.why?.kind, 'fills_gap');
  assert.equal(ranked.why?.kind === 'fills_gap' ? ranked.why.category : null, 'shoes');
  // Gap weight (10) dominates the score.
  assert.ok(ranked.score >= 10);
});

test('fills_gap outranks similar-tier products that do not fill the gap', () => {
  const closet = [
    owned({ id: 't1', category: 'top' }),
    owned({ id: 'b1', category: 'bottom' }),
    owned({ id: 'o1', category: 'outerwear' }),
  ];
  const shoe = product({ id: 'shoe', category: 'shoes' });
  const hat = product({ id: 'hat', category: 'hat' });
  const ranked = rankProducts([hat, shoe], closet, NO_PROFILE);
  assert.equal(first(ranked).id, 'shoe', 'the gap-filler should rank first');
});

// --- ranker: completes_outfits ----------------------------------------------

test('rankProducts counts completable looks for a top as the number of owned bottoms', () => {
  const closet = [
    owned({ id: 'b1', category: 'bottom' }),
    owned({ id: 'b2', category: 'bottom' }),
  ];
  const top = product({ id: 'top', category: 'top' });
  const ranked = first(rankProducts([top], closet, NO_PROFILE));
  assert.equal(ranked.why?.kind, 'completes_outfits');
  assert.equal(ranked.why?.kind === 'completes_outfits' ? ranked.why.count : -1, 2);
  assert.equal(ranked.score, 2);
});

test('a dress completes exactly one look on its own, even from an empty closet', () => {
  const dress = product({ id: 'dress', category: 'dress' });
  const ranked = first(rankProducts([dress], [], NO_PROFILE));
  assert.equal(ranked.why?.kind, 'completes_outfits');
  assert.equal(ranked.why?.kind === 'completes_outfits' ? ranked.why.count : -1, 1);
});

// --- ranker: empty-closet behavior ------------------------------------------

test('an empty closet names no gap and flags nothing as similar', () => {
  const shoe = product({ id: 'shoe', category: 'shoes' });
  const top = product({ id: 'top', category: 'top' });
  const ranked = rankProducts([shoe, top], [], NO_PROFILE);
  for (const p of ranked) {
    assert.notEqual(p.why?.kind, 'fills_gap', 'no gap should be named on an empty closet');
    assert.notEqual(p.why?.kind, 'similar_owned');
  }
});

// --- ranker: similar_owned warning + penalty --------------------------------

test('rankProducts warns and penalises a near-duplicate of an owned piece', () => {
  const closet = [owned({ id: 't1', category: 'top', colors: ['black'] })];
  const dupe = product({ id: 'dupe', category: 'top', colors: ['black'] });
  const ranked = first(rankProducts([dupe], closet, NO_PROFILE));
  assert.equal(ranked.why?.kind, 'similar_owned');
  assert.equal(ranked.why?.kind === 'similar_owned' ? ranked.why.ownedCount : -1, 1);
  assert.ok(ranked.score < 0, 'a near-duplicate should carry a penalty');
});

test('similar_owned is surfaced over completes_outfits — honesty first', () => {
  // Product both completes a look (with the owned bottom) AND duplicates the top.
  const closet = [
    owned({ id: 't1', category: 'top', colors: ['black'] }),
    owned({ id: 'b1', category: 'bottom', colors: ['navy'] }),
  ];
  const dupe = product({ id: 'dupe', category: 'top', colors: ['black'] });
  const ranked = first(rankProducts([dupe], closet, NO_PROFILE));
  assert.equal(ranked.why?.kind, 'similar_owned', 'the warning must win over a completes boast');
});

test('a different color in the same category is not flagged as similar', () => {
  const closet = [owned({ id: 't1', category: 'top', colors: ['black'] })];
  const other = product({ id: 'other', category: 'top', colors: ['white'] });
  const ranked = first(rankProducts([other], closet, NO_PROFILE));
  assert.notEqual(ranked.why?.kind, 'similar_owned');
});

// --- ranker: gap precedence + palette scoring + ordering --------------------

test('fills_gap is surfaced over completes_outfits when both apply', () => {
  // Closet: top + bottom (no shoes) → gap is shoes. A shoe also completes the
  // owned top×bottom anchor, so completes applies too — gap must still win.
  const closet = [
    owned({ id: 't1', category: 'top' }),
    owned({ id: 'b1', category: 'bottom' }),
  ];
  const shoe = product({ id: 'shoe', category: 'shoes' });
  const ranked = first(rankProducts([shoe], closet, NO_PROFILE));
  assert.equal(ranked.why?.kind, 'fills_gap');
  // Gap (10) + one completed anchor (1) = 11.
  assert.equal(ranked.score, 11);
});

test('a palette match adds a positive weight', () => {
  const profile: StyleProfileLite = { archetype: 'Minimalist', palette: ['black'], keywords: [] };
  const onPalette = product({ id: 'on', category: 'dress', colors: ['black'] });
  const offPalette = product({ id: 'off', category: 'dress', colors: ['red'] });
  const ranked = rankProducts([offPalette, onPalette], [], profile);
  const on = ranked.find((p) => p.id === 'on');
  const off = ranked.find((p) => p.id === 'off');
  assert.ok(on);
  assert.ok(off);
  assert.equal(on.score - off.score, 2, 'palette match is worth +2');
  assert.equal(first(ranked).id, 'on', 'the palette match sorts first');
});

test('rankProducts returns results sorted by score descending', () => {
  const closet = [
    owned({ id: 't1', category: 'top' }),
    owned({ id: 'b1', category: 'bottom' }),
  ];
  const products = [
    product({ id: 'bag', category: 'bag' }),
    product({ id: 'shoe', category: 'shoes' }),
    product({ id: 'top', category: 'top' }),
  ];
  const scores = rankProducts(products, closet, NO_PROFILE).map((p) => p.score);
  for (let i = 1; i < scores.length; i += 1) {
    assert.ok((scores[i - 1] ?? 0) >= (scores[i] ?? 0), 'scores must be non-increasing');
  }
  const ranked = rankProducts(products, closet, NO_PROFILE);
  // Every ranked entry keeps its ShopProduct fields.
  assert.ok(ranked.every((p) => typeof p.title === 'string' && typeof p.affiliateUrl === 'string'));
});

// --- ranker: whyDetail (rich identities behind each signal) ------------------

test('whyDetail.completesWith names the owned bottoms a top builds with', () => {
  const closet = [
    owned({ id: 'b1', category: 'bottom', colors: ['indigo'] }),
    owned({ id: 'b2', category: 'bottom', colors: ['black'] }),
  ];
  const top = product({ id: 'top', category: 'top' });
  const ranked = first(rankProducts([top], closet, NO_PROFILE));

  assert.ok(ranked.whyDetail, 'expected a whyDetail');
  assert.deepEqual(
    ranked.whyDetail?.completesWith.map((r) => r.id),
    ['b1', 'b2'],
    'completesWith should name the owned bottoms in closet order',
  );
  assert.deepEqual(
    ranked.whyDetail?.completesWith.map((r) => r.label),
    ['indigo bottom', 'black bottom'],
    'label is primary-color + category',
  );
  // imageUrl is left for the server to resolve from the DB.
  assert.ok(ranked.whyDetail?.completesWith.every((r) => r.imageUrl === undefined));
});

test('whyDetail label falls back to brand, then bare category', () => {
  const closet = [
    owned({ id: 'b1', category: 'bottom', brand: 'A.P.C.' }), // no colors → brand
    owned({ id: 'b2', category: 'bottom' }), // no colors, no brand → category only
  ];
  const top = product({ id: 'top', category: 'top' });
  const ranked = first(rankProducts([top], closet, NO_PROFILE));
  assert.deepEqual(
    ranked.whyDetail?.completesWith.map((r) => r.label),
    ['A.P.C. bottom', 'bottom'],
  );
});

test('whyDetail.fillsGap reports the gap category and how many are owned in it', () => {
  // Essentials counts: shoes=1, bottom=2, top=2, outerwear=1. Min is 1; the
  // shoes/outerwear tie breaks to shoes (ESSENTIAL_CATEGORIES order) → gap=shoes.
  const closet = [
    owned({ id: 'sh1', category: 'shoes' }),
    owned({ id: 'b1', category: 'bottom' }),
    owned({ id: 'b2', category: 'bottom' }),
    owned({ id: 't1', category: 'top' }),
    owned({ id: 't2', category: 'top' }),
    owned({ id: 'o1', category: 'outerwear' }),
  ];
  const shoe = product({ id: 'shoe', category: 'shoes' });
  const ranked = first(rankProducts([shoe], closet, NO_PROFILE));

  assert.equal(ranked.why?.kind, 'fills_gap');
  assert.deepEqual(ranked.whyDetail?.fillsGap, { category: 'shoes', ownedCount: 1 });
});

test('whyDetail.fillsGap is null for a product that does not fill the gap', () => {
  const closet = [
    owned({ id: 't1', category: 'top' }),
    owned({ id: 'b1', category: 'bottom' }),
    owned({ id: 'o1', category: 'outerwear' }),
  ];
  // gap is shoes; a bag does not fill it.
  const bag = product({ id: 'bag', category: 'bag' });
  const ranked = first(rankProducts([bag], closet, NO_PROFILE));
  assert.equal(ranked.whyDetail?.fillsGap ?? null, null);
});

test('whyDetail.similarTo names the owned near-duplicates', () => {
  const closet = [
    owned({ id: 't1', category: 'top', colors: ['black'] }),
    owned({ id: 't2', category: 'top', colors: ['black'] }),
    owned({ id: 'other', category: 'top', colors: ['white'] }), // different color → not similar
  ];
  const dupe = product({ id: 'dupe', category: 'top', colors: ['black'] });
  const ranked = first(rankProducts([dupe], closet, NO_PROFILE));

  assert.equal(ranked.why?.kind, 'similar_owned');
  assert.deepEqual(
    ranked.whyDetail?.similarTo.map((r) => r.id),
    ['t1', 't2'],
    'similarTo names only the same-category, shared-color owned pieces',
  );
  assert.deepEqual(ranked.whyDetail?.similarTo.map((r) => r.label), ['black top', 'black top']);
});

test('whyDetail.paletteMatch surfaces the product colors that hit the palette', () => {
  const profile: StyleProfileLite = { archetype: 'Minimalist', palette: ['black', 'navy'], keywords: [] };
  const item = product({ id: 'dress', category: 'dress', colors: ['black', 'white', 'navy'] });
  const ranked = first(rankProducts([item], [], profile));
  assert.deepEqual(ranked.whyDetail?.paletteMatch, ['black', 'navy']);
});

test('whyDetail arrays are each capped at 3 items in stable order', () => {
  const closet = [
    owned({ id: 'b1', category: 'bottom' }),
    owned({ id: 'b2', category: 'bottom' }),
    owned({ id: 'b3', category: 'bottom' }),
    owned({ id: 'b4', category: 'bottom' }),
    owned({ id: 'b5', category: 'bottom' }),
  ];
  const top = product({ id: 'top', category: 'top' });
  const ranked = first(rankProducts([top], closet, NO_PROFILE));
  assert.equal(ranked.whyDetail?.completesWith.length, 3, 'completesWith caps at 3');
  assert.deepEqual(
    ranked.whyDetail?.completesWith.map((r) => r.id),
    ['b1', 'b2', 'b3'],
    'the cap keeps the first three in closet order',
  );

  // similarTo cap.
  const dupeCloset = [
    owned({ id: 's1', category: 'top', colors: ['black'] }),
    owned({ id: 's2', category: 'top', colors: ['black'] }),
    owned({ id: 's3', category: 'top', colors: ['black'] }),
    owned({ id: 's4', category: 'top', colors: ['black'] }),
  ];
  const dupe = product({ id: 'dupe', category: 'top', colors: ['black'] });
  const rankedDupe = first(rankProducts([dupe], dupeCloset, NO_PROFILE));
  assert.equal(rankedDupe.whyDetail?.similarTo.length, 3, 'similarTo caps at 3');

  // paletteMatch cap.
  const profile: StyleProfileLite = {
    archetype: 'X',
    palette: ['black', 'navy', 'grey', 'ecru'],
    keywords: [],
  };
  const many = product({ id: 'many', category: 'dress', colors: ['black', 'navy', 'grey', 'ecru'] });
  const rankedPalette = first(rankProducts([many], [], profile));
  assert.equal(rankedPalette.whyDetail?.paletteMatch.length, 3, 'paletteMatch caps at 3');
});

test('whyDetail is null when no signal names an owned item', () => {
  // Empty closet, no profile: no gap, no completes-with owned pieces, no similar.
  const top = product({ id: 'top', category: 'top' });
  const ranked = first(rankProducts([top], [], NO_PROFILE));
  assert.equal(ranked.whyDetail, null);
});

test('whyDetail is additive: the compact why label is unchanged by the collapse', () => {
  // Regression-guard the count-only labels the rec-event route + WhyLabel depend
  // on: the same inputs must still yield exactly these `why` values, with the
  // rich detail layered ALONGSIDE (never replacing) the compact label.
  const closet = [
    owned({ id: 't1', category: 'top', colors: ['black'] }),
    owned({ id: 'b1', category: 'bottom', colors: ['navy'] }),
    owned({ id: 'o1', category: 'outerwear' }),
  ];
  const shoe = product({ id: 'shoe', category: 'shoes' }); // fills the shoes gap
  const dupeTop = product({ id: 'dupe', category: 'top', colors: ['black'] }); // similar_owned
  const bagCloset = [owned({ id: 'bb', category: 'bottom' })];
  const topOverBottom = product({ id: 'top2', category: 'top' }); // completes_outfits

  const shoeRanked = first(rankProducts([shoe], closet, NO_PROFILE));
  assert.deepEqual(shoeRanked.why, { kind: 'fills_gap', category: 'shoes' });
  assert.ok(shoeRanked.whyDetail, 'detail layered alongside the label');

  const dupeRanked = first(rankProducts([dupeTop], closet, NO_PROFILE));
  assert.deepEqual(dupeRanked.why, { kind: 'similar_owned', ownedCount: 1 });
  assert.ok(dupeRanked.whyDetail);

  const completesRanked = first(rankProducts([topOverBottom], bagCloset, NO_PROFILE));
  assert.deepEqual(completesRanked.why, { kind: 'completes_outfits', count: 1 });
  assert.ok(completesRanked.whyDetail);
});

// --- canonical filter facets (web/mobile parity) -----------------------------

test('BUDGET_BANDS is a non-empty, ascending, non-overlapping tiling', () => {
  assert.ok(BUDGET_BANDS.length >= 3, 'expected several budget bands');
  const ids = BUDGET_BANDS.map((b) => b.id);
  assert.equal(new Set(ids).size, ids.length, 'duplicate band id');

  // Every price bound is a positive number and every band carries at least one.
  for (const band of BUDGET_BANDS) {
    assert.ok(band.label.length > 0, `${band.id} missing label`);
    assert.ok(
      band.minPrice !== undefined || band.maxPrice !== undefined,
      `${band.id} sets no price bound`,
    );
  }

  // Ascending, non-overlapping: each band's maxPrice is below the next minPrice.
  for (let i = 1; i < BUDGET_BANDS.length; i += 1) {
    const prev = BUDGET_BANDS[i - 1];
    const cur = BUDGET_BANDS[i];
    assert.ok(prev && cur);
    assert.ok(prev.maxPrice !== undefined, `${prev.id} should cap so the tiling closes`);
    assert.ok(cur.minPrice !== undefined, `${cur.id} should have a floor`);
    assert.ok(
      (prev.maxPrice as number) < (cur.minPrice as number),
      `${prev.id} overlaps ${cur.id}`,
    );
  }

  // First band opens at the bottom, last band is open-ended at the top.
  assert.equal(BUDGET_BANDS[0]?.minPrice, undefined, 'cheapest band should have no floor');
  assert.equal(
    BUDGET_BANDS[BUDGET_BANDS.length - 1]?.maxPrice,
    undefined,
    'priciest band should be open-ended',
  );
});

test('budgetBandToQuery maps each band onto its ShopSearchQuery bounds', () => {
  assert.deepEqual(budgetBandToQuery('under-50'), { maxPrice: 49 });
  assert.deepEqual(budgetBandToQuery('50-150'), { minPrice: 50, maxPrice: 149 });
  assert.deepEqual(budgetBandToQuery('over-400'), { minPrice: 400 });
  // Unknown / stale id degrades to no price filter rather than throwing.
  assert.deepEqual(budgetBandToQuery('nope'), {});
});

test('every budget band actually selects fixtures via the provider', async () => {
  const provider = createFixtureShopProvider();
  for (const band of BUDGET_BANDS) {
    const res = await provider.search(budgetBandToQuery(band.id));
    assert.ok(res.products.length > 0, `${band.id} matched no fixtures`);
  }
});

test('SIZE_OPTIONS is non-empty, unique, ordered, and covers real catalog sizes', () => {
  assert.ok(SIZE_OPTIONS.length > 0, 'expected preset size chips');
  assert.equal(new Set(SIZE_OPTIONS).size, SIZE_OPTIONS.length, 'duplicate size option');

  // Apparel sizes lead, in ascending order.
  assert.deepEqual(SIZE_OPTIONS.slice(0, 5), ['XS', 'S', 'M', 'L', 'XL']);

  // Every canonical size is carried by at least one fixture (no dead chips).
  const catalogSizes = new Set(fixtureCatalog().flatMap((p) => p.sizes ?? []));
  for (const size of SIZE_OPTIONS) {
    assert.ok(catalogSizes.has(size), `size chip ${size} matches no fixture`);
  }
  // ...and every size the catalog carries has a chip (full coverage).
  for (const size of catalogSizes) {
    assert.ok(SIZE_OPTIONS.includes(size), `catalog size ${size} has no chip`);
  }
});

test('BRAND_TIER_ORDER fixes the tier chip order, most exclusive first', () => {
  assert.deepEqual(BRAND_TIER_ORDER, ['luxury', 'premium', 'contemporary', 'high_street']);
  // Covers exactly the tiers the catalog uses.
  const catalogTiers = new Set(fixtureCatalog().map((p) => p.brandTier));
  assert.equal(new Set(BRAND_TIER_ORDER).size, catalogTiers.size);
  for (const tier of catalogTiers) {
    assert.ok(BRAND_TIER_ORDER.includes(tier), `missing tier in order: ${tier}`);
  }
});
