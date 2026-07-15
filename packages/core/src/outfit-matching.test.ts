/**
 * Unit tests for the deterministic "shop similar from my closet" matcher.
 *
 * Pure and total — every property is a fact about the scoring rule:
 *   same category +3, each shared normalized color +2 (cap 2), same pattern +1
 *   (both defined), same brand +1 (both defined, case-insensitive) — zero-score
 *   excluded, top 3 per slot, ties by item id ascending. Colors compare through
 *   `normalizeColor`, so 'Black' ≡ 'black' but NOT '#000'.
 *
 * Run: node --experimental-strip-types --test src/outfit-matching.test.ts
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { matchOutfitToCloset } from './outfit-matching.ts';
import type { OviItem } from './ovi.ts';

/** Build an OviItem with sensible defaults; override what a test cares about. */
function item(partial: Partial<OviItem> & Pick<OviItem, 'id' | 'category'>): OviItem {
  return { colors: [], pattern: null, brand: null, ...partial };
}

/** Narrow away `undefined` from an indexed access (noUncheckedIndexedAccess). */
function present<T>(value: T | undefined, label: string): T {
  assert.ok(value !== undefined, `expected ${label} to be present`);
  return value;
}

// --- category beats a slot-only match ---------------------------------------

test('a same-category match outranks a same-slot-but-different-category match', () => {
  // Both a top and a dress occupy the 'base' slot. The posted item is a top: a
  // viewer top scores on category (+3), a viewer dress only on a shared color (+2).
  const posted = item({ id: 'p-top', category: 'top', colors: ['black'] });
  const viewerTop = item({ id: 'v-top', category: 'top', colors: ['white'] }); // category only → 3
  const viewerDress = item({ id: 'v-dress', category: 'dress', colors: ['black'] }); // color only → 2

  const slotMatch = present(matchOutfitToCloset([posted], [viewerTop, viewerDress])[0], 'slot match');
  assert.equal(slotMatch.slot, 'base');
  assert.deepEqual(slotMatch.matches.map((m) => m.item.id), ['v-top', 'v-dress']);
  assert.equal(present(slotMatch.matches[0], 'match 0').score, 3);
  assert.equal(present(slotMatch.matches[1], 'match 1').score, 2);
});

// --- color matching goes through normalizeColor -----------------------------

test("color matches via normalizeColor: 'Black' ≡ 'black' but NOT '#000'", () => {
  const posted = item({ id: 'p', category: 'shoes', colors: ['Black'] });
  const named = item({ id: 'named', category: 'shoes', colors: ['black'] }); // category +3, color +2 → 5
  const hex = item({ id: 'hex', category: 'shoes', colors: ['#000'] }); // category +3 only → 3

  const slotMatch = present(matchOutfitToCloset([posted], [named, hex])[0], 'slot match');
  assert.deepEqual(slotMatch.matches.map((m) => m.item.id), ['named', 'hex']);
  const namedMatch = present(slotMatch.matches[0], 'match 0');
  assert.equal(namedMatch.score, 5);
  assert.deepEqual(namedMatch.reasons, ['same category', 'shares color: black']);
  // '#000' normalizes to '000', which does not equal 'black' — no color reason.
  const hexMatch = present(slotMatch.matches[1], 'match 1');
  assert.equal(hexMatch.score, 3);
  assert.deepEqual(hexMatch.reasons, ['same category']);
});

// --- empty closet -----------------------------------------------------------

test('an empty closet yields a SlotMatch per posted item with empty matches', () => {
  const posted = item({ id: 'p', category: 'top', colors: ['black'] });
  const result = matchOutfitToCloset([posted], []);
  assert.equal(result.length, 1);
  const slotMatch = present(result[0], 'slot match');
  assert.equal(slotMatch.posted.id, 'p');
  assert.deepEqual(slotMatch.matches, []);
});

// --- top 3 per slot ---------------------------------------------------------

test('at most three matches are returned per slot, highest score first', () => {
  const posted = item({ id: 'p', category: 'top', colors: ['black'] });
  // Five equally-scoring viewer tops (category + one shared color = 5 each); the
  // tie falls to item id ascending, so the first three ids come back.
  const closet = ['t5', 't2', 't4', 't1', 't3'].map((id) =>
    item({ id, category: 'top', colors: ['black'] }),
  );
  const slotMatch = present(matchOutfitToCloset([posted], closet)[0], 'slot match');
  assert.equal(slotMatch.matches.length, 3);
  assert.deepEqual(slotMatch.matches.map((m) => m.item.id), ['t1', 't2', 't3']);
});

// --- zero-score exclusion ---------------------------------------------------

test('a viewer item that shares only the slot (no scoring signal) is excluded', () => {
  // A bag and a hat share the 'accessory' slot but not the category; with no
  // shared color/pattern/brand the hat scores 0 and is dropped.
  const posted = item({ id: 'p-bag', category: 'bag', colors: ['navy'] });
  const hat = item({ id: 'v-hat', category: 'hat', colors: ['red'] }); // slot-only, score 0
  const slotMatch = present(matchOutfitToCloset([posted], [hat])[0], 'slot match');
  assert.equal(slotMatch.slot, 'accessory');
  assert.deepEqual(slotMatch.matches, []);
});

// --- deterministic ties -----------------------------------------------------

test('equal-scoring matches are ordered by item id ascending, regardless of input order', () => {
  const posted = item({ id: 'p', category: 'top' });
  const closet = ['c', 'a', 'b'].map((id) => item({ id, category: 'top' })); // all score 3
  const slotMatch = present(matchOutfitToCloset([posted], closet)[0], 'slot match');
  assert.deepEqual(slotMatch.matches.map((m) => m.item.id), ['a', 'b', 'c']);
});

// --- null-slot posted item is skipped ---------------------------------------

test('a posted item whose category maps to no slot produces no SlotMatch', () => {
  const noSlot = item({ id: 'p-mystery', category: 'mystery', colors: ['black'] });
  const validTop = item({ id: 'p-top', category: 'top', colors: ['black'] });
  const viewerTop = item({ id: 'v-top', category: 'top', colors: ['black'] });

  // Only the valid posted item yields a SlotMatch; the null-slot one is skipped.
  const result = matchOutfitToCloset([noSlot, validTop], [viewerTop]);
  assert.equal(result.length, 1);
  assert.equal(present(result[0], 'slot match').posted.id, 'p-top');
});

// --- reasons content: every signal, color cap, brand case-insensitivity -----

test('reasons carry each scoring signal in stable order, colors capped at 2', () => {
  const posted = item({
    id: 'p',
    category: 'top',
    colors: ['black', 'white', 'navy'],
    pattern: 'striped',
    brand: 'Uniqlo',
  });
  const viewer = item({
    id: 'v',
    category: 'top',
    colors: ['black', 'white', 'navy'],
    pattern: 'striped',
    brand: '  uniqlo  ', // trimmed + lowercased matches 'Uniqlo' (case/whitespace only)
  });
  const slotMatch = present(matchOutfitToCloset([posted], [viewer])[0], 'slot match');
  const match = present(slotMatch.matches[0], 'match 0');
  // category (3) + two colors (4, navy dropped by the cap) + pattern (1) + brand (1) = 9.
  assert.equal(match.score, 9);
  assert.deepEqual(match.reasons, [
    'same category',
    'shares color: black',
    'shares color: white',
    'same pattern',
    'same brand',
  ]);
});

test('pattern and brand only score when BOTH items define them', () => {
  const posted = item({ id: 'p', category: 'top', pattern: null, brand: null });
  const viewer = item({ id: 'v', category: 'top', pattern: 'striped', brand: 'Uniqlo' });
  const slotMatch = present(matchOutfitToCloset([posted], [viewer])[0], 'slot match');
  // Only the category signal fires — the posted item defines neither pattern nor brand.
  const match = present(slotMatch.matches[0], 'match 0');
  assert.equal(match.score, 3);
  assert.deepEqual(match.reasons, ['same category']);
});

// --- multiple posted items in one slot --------------------------------------

test('two posted items in the same slot yield one SlotMatch each, keyed by posted item', () => {
  const postedA = item({ id: 'p-a', category: 'top', colors: ['black'] });
  const postedB = item({ id: 'p-b', category: 'top', colors: ['white'] });
  const viewer = item({ id: 'v', category: 'top', colors: ['black'] });

  const result = matchOutfitToCloset([postedA, postedB], [viewer]);
  assert.equal(result.length, 2);
  assert.deepEqual(result.map((s) => s.posted.id), ['p-a', 'p-b']);
  const slotA = present(result[0], 'slot A');
  const slotB = present(result[1], 'slot B');
  assert.equal(slotA.slot, 'base');
  assert.equal(slotB.slot, 'base');
  // The viewer's black top matches postedA on category + color (5); it matches
  // postedB on category alone (3, no shared color) — one SlotMatch per posted item.
  assert.deepEqual(slotA.matches.map((m) => m.item.id), ['v']);
  assert.equal(present(slotA.matches[0], 'match A0').score, 5);
  assert.deepEqual(slotB.matches.map((m) => m.item.id), ['v']);
  assert.equal(present(slotB.matches[0], 'match B0').score, 3);
});
