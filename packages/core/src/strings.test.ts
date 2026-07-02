import { test } from 'node:test';
import assert from 'node:assert/strict';

import { strings, type OviStrings } from './strings.ts';

// --- canonical lines (verbatim) ----------------------------------------------

test('the empty-closet line is the canonical copy, verbatim', () => {
  assert.equal(strings.closet.empty, "Let's get your first pieces in — it takes a minute.");
});

test('the Ovi FAB label is verbatim', () => {
  assert.equal(strings.ovi.fabLabel, 'Ovi, your stylist');
});

// --- weather-aware suggestion intro ------------------------------------------

test('dailySuggestionIntro grounds the line in the city and weather', () => {
  const line = strings.ovi.dailySuggestionIntro('Lisbon', 'Cool and clear');
  assert.equal(line, "Cool and clear in Lisbon today. Here's what I'd wear.");
});

// --- voice lint --------------------------------------------------------------

/**
 * Walk every leaf of the deck, resolving function leaves with sample args, and
 * hand each finished string to `check`. Keeps the lint below exhaustive even as
 * new surfaces are added.
 */
function forEachString(deck: OviStrings, check: (value: string) => void): void {
  const visit = (node: unknown): void => {
    if (typeof node === 'string') {
      check(node);
    } else if (typeof node === 'function') {
      check((node as (...args: string[]) => string)('Sample City', 'Sample weather'));
    } else if (node && typeof node === 'object') {
      for (const value of Object.values(node)) {
        visit(value);
      }
    }
  };
  visit(deck);
}

test('no string uses hype, fake urgency, or dark-pattern phrasing', () => {
  const banned = [/!!/, /\bbuy now\b/i, /\bdon't miss\b/i, /\bhurry\b/i, /\blast chance\b/i];
  forEachString(strings, (value) => {
    for (const pattern of banned) {
      assert.doesNotMatch(value, pattern, `Voice lint: "${value}" matches ${pattern}`);
    }
  });
});

test('no surface stacks exclamation marks (at most one per string)', () => {
  forEachString(strings, (value) => {
    const count = (value.match(/!/g) ?? []).length;
    assert.ok(count <= 1, `Voice lint: "${value}" has ${count} exclamation marks`);
  });
});
