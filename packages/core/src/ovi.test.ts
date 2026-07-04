import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  OviResponseSchema,
  ProposedOutfitSchema,
  buildOviSystemPrompt,
  buildOviUserContext,
  composeOutfit,
  type OviItem,
  type StyleProfileLite,
  type Weather,
} from './ovi.ts';

// --- fixtures ----------------------------------------------------------------

/** Build an OviItem with sensible defaults; override what a test cares about. */
function item(partial: Partial<OviItem> & Pick<OviItem, 'id' | 'category'>): OviItem {
  return { colors: [], pattern: null, brand: null, ...partial };
}

const PROFILE: StyleProfileLite = {
  archetype: 'Minimalist',
  palette: ['#1a1a1a', '#ffffff', 'camel'],
  keywords: ['clean', 'essential'],
};

/** A closet that can build a full base + bottom + shoes look. */
const FULL_CLOSET: OviItem[] = [
  item({ id: 'top-1', category: 'top', colors: ['black'] }),
  item({ id: 'bottom-1', category: 'bottom', colors: ['navy'] }),
  item({ id: 'shoes-1', category: 'shoes', colors: ['white'] }),
];

const COLD: Weather = { tempC: 4, condition: 'snow', description: 'light snow' };
const WARM: Weather = { tempC: 26, condition: 'clear', description: 'clear sky' };

/** Every id in a proposed outfit must be one of the closet's real item ids. */
function assertIdsInCloset(itemIds: readonly string[], closet: readonly OviItem[]): void {
  const known = new Set(closet.map((i) => i.id));
  for (const id of itemIds) {
    assert.ok(known.has(id), `proposed item id "${id}" is not in the closet`);
  }
}

// --- composeOutfit: a real look from a real closet ---------------------------

test('composeOutfit builds a valid base + bottom + shoes look from the closet', () => {
  const res = composeOutfit({ intent: 'today', items: FULL_CLOSET, profile: PROFILE });
  assert.ok(res.outfit, 'expected an outfit');
  const ids = res.outfit.itemIds;
  assert.ok(ids.includes('top-1'));
  assert.ok(ids.includes('bottom-1'));
  assert.ok(ids.includes('shoes-1'));
  assertIdsInCloset(ids, FULL_CLOSET);
  // The response and its outfit must satisfy the structured-output contract.
  OviResponseSchema.parse(res);
  ProposedOutfitSchema.parse(res.outfit);
});

test('every returned item id belongs to the input closet', () => {
  const res = composeOutfit({ intent: 'style_for', items: FULL_CLOSET, profile: PROFILE, weather: COLD });
  assert.ok(res.outfit);
  assertIdsInCloset(res.outfit.itemIds, FULL_CLOSET);
  assert.equal(new Set(res.outfit.itemIds).size, res.outfit.itemIds.length, 'no id repeats');
});

test('a dress anchors a look without pulling in a bottom', () => {
  const closet = [
    item({ id: 'dress-1', category: 'dress', colors: ['black'] }),
    item({ id: 'bottom-1', category: 'bottom' }),
    item({ id: 'shoes-1', category: 'shoes' }),
  ];
  const res = composeOutfit({ intent: 'today', items: closet, profile: PROFILE });
  assert.ok(res.outfit);
  assert.ok(res.outfit.itemIds.includes('dress-1'));
  assert.ok(!res.outfit.itemIds.includes('bottom-1'), 'a dress look must not add a bottom');
});

// --- style_item: build around a focal piece ----------------------------------

test('style_item includes the focal id and builds around it', () => {
  const closet = [
    item({ id: 'top-1', category: 'top' }),
    item({ id: 'bottom-1', category: 'bottom' }),
    item({ id: 'shoes-1', category: 'shoes' }),
    item({ id: 'bag-1', category: 'bag' }),
  ];
  const res = composeOutfit({ intent: 'style_item', items: closet, profile: PROFILE, itemContext: 'bag-1' });
  assert.ok(res.outfit);
  assert.ok(res.outfit.itemIds.includes('bag-1'), 'focal item must be in the look');
  assert.ok(res.outfit.itemIds.includes('top-1'));
  assert.ok(res.outfit.itemIds.includes('bottom-1'));
  assertIdsInCloset(res.outfit.itemIds, closet);
});

// --- whats_missing: honest gap, no outfit ------------------------------------

test('whats_missing returns no outfit and names the real gap', () => {
  const closet = [
    item({ id: 'top-1', category: 'top' }),
    item({ id: 'top-2', category: 'top' }),
    item({ id: 'bottom-1', category: 'bottom' }),
    // no shoes at all — that is the gap
  ];
  const res = composeOutfit({ intent: 'whats_missing', items: closet, profile: PROFILE });
  assert.equal(res.outfit, null, 'a gap answer proposes no outfit');
  assert.match(res.reply, /shoes/i, 'the reply should name the missing category');
  OviResponseSchema.parse(res);
});

// --- sparse closet: honest, never fabricated ---------------------------------

test('a one-item closet yields an honest no-outfit reply and fabricates nothing', () => {
  const closet = [item({ id: 'top-1', category: 'top' })];
  const res = composeOutfit({ intent: 'today', items: closet, profile: PROFILE });
  assert.equal(res.outfit, null, 'cannot honestly build a full look from one piece');
  assert.ok(res.reply.length > 0);
  OviResponseSchema.parse(res);
});

// --- weather: outerwear appears when it is cold ------------------------------

test('cold weather pulls in outerwear when the closet has it', () => {
  const closet = [
    item({ id: 'top-1', category: 'top' }),
    item({ id: 'bottom-1', category: 'bottom' }),
    item({ id: 'shoes-1', category: 'shoes' }),
    item({ id: 'coat-1', category: 'outerwear' }),
  ];
  const cold = composeOutfit({ intent: 'today', items: closet, profile: PROFILE, weather: COLD });
  assert.ok(cold.outfit);
  assert.ok(cold.outfit.itemIds.includes('coat-1'), 'cold weather should add outerwear');

  const warm = composeOutfit({ intent: 'today', items: closet, profile: PROFILE, weather: WARM });
  assert.ok(warm.outfit);
  assert.ok(!warm.outfit.itemIds.includes('coat-1'), 'warm weather should not add outerwear');
});

// --- palette preference: matching colors win their slot ----------------------

test('palette preference favors a matching-color piece', () => {
  const closet = [
    // off-palette top listed first — must NOT be chosen over the palette match
    item({ id: 'top-off', category: 'top', colors: ['neon green'] }),
    item({ id: 'top-match', category: 'top', colors: ['camel'] }),
    item({ id: 'bottom-1', category: 'bottom' }),
    item({ id: 'shoes-1', category: 'shoes' }),
  ];
  const res = composeOutfit({ intent: 'today', items: closet, profile: PROFILE });
  assert.ok(res.outfit);
  assert.ok(res.outfit.itemIds.includes('top-match'), 'the palette-matching top should win');
  assert.ok(!res.outfit.itemIds.includes('top-off'), 'the off-palette top should be skipped');
});

// --- recency: a not-recently-worn piece wins when there is a choice ----------

test('recency avoidance prefers a piece not worn recently', () => {
  const closet = [
    item({ id: 'top-worn', category: 'top' }),
    item({ id: 'top-fresh', category: 'top' }),
    item({ id: 'bottom-1', category: 'bottom' }),
    item({ id: 'shoes-1', category: 'shoes' }),
  ];
  const res = composeOutfit({
    intent: 'today',
    items: closet,
    profile: PROFILE,
    wearLogs: [{ itemIds: ['top-worn'], wornOn: '2026-07-01' }],
  });
  assert.ok(res.outfit);
  assert.ok(res.outfit.itemIds.includes('top-fresh'), 'the fresh top should be preferred');
});

// --- null profile: still builds, palette simply does not weigh in ------------

test('a missing style profile still produces a real look', () => {
  const res = composeOutfit({ intent: 'today', items: FULL_CLOSET, profile: null });
  assert.ok(res.outfit);
  assertIdsInCloset(res.outfit.itemIds, FULL_CLOSET);
});

// --- prompt builders ---------------------------------------------------------

test('buildOviSystemPrompt bakes in the trust rule and voice', () => {
  const prompt = buildOviSystemPrompt(PROFILE, COLD);
  assert.match(prompt, /only from the inventory/i);
  assert.match(prompt, /Shop the closet first/i);
  assert.match(prompt, /Minimalist/);
  assert.match(prompt, /snow/i, 'weather should appear when supplied');
});

test('buildOviUserContext stays inventory-scoped and names the focal item', () => {
  const context = buildOviUserContext({
    intent: 'style_item',
    message: 'what goes with these?',
    profile: PROFILE,
    items: FULL_CLOSET,
    wearLogs: [],
    weather: null,
    itemContext: 'shoes-1',
  });
  assert.match(context, /Intent: style_item/);
  assert.match(context, /shoes-1/);
  assert.match(context, /what goes with these\?/);
});
