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
 * hand each finished string to `check`. Function leaves may return a string
 * (e.g. `dailySuggestionIntro`) or an object of strings (e.g. `quiz.eraFor`),
 * so we feed their return value back through `visit`. Keeps the lint below
 * exhaustive even as new surfaces are added.
 */
function forEachString(deck: OviStrings, check: (value: string) => void): void {
  const visit = (node: unknown): void => {
    if (typeof node === 'string') {
      check(node);
    } else if (typeof node === 'function') {
      // Sample args cover every signature: strings work as cities/weather/
      // archetypes, and coerce into `progressLabel`'s numeric slots.
      visit((node as (...args: unknown[]) => unknown)('reset', 'Sample Archetype'));
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

test('the whole deck spends at most one exclamation mark', () => {
  let total = 0;
  forEachString(strings, (value) => {
    total += (value.match(/!/g) ?? []).length;
  });
  assert.ok(total <= 1, `Voice lint: the deck uses ${total} exclamation marks (budget is 1)`);
});

// --- style quiz --------------------------------------------------------------

const MOOD_IDS = ['reset', 'refined', 'bold', 'soft', 'experimental', 'effortless'] as const;

test('all six era-moods are present with a non-empty title and tagline', () => {
  const moods = strings.quiz.moods;
  assert.equal(Object.keys(moods).length, MOOD_IDS.length);
  for (const id of MOOD_IDS) {
    assert.ok(moods[id], `missing mood: ${id}`);
    assert.ok(moods[id].title.trim().length > 0, `mood ${id} has an empty title`);
    assert.ok(moods[id].tagline.trim().length > 0, `mood ${id} has an empty tagline`);
  }
});

test('eraFor composes a non-empty title and description for every mood', () => {
  const archetype = 'Quiet Luxe';
  for (const id of MOOD_IDS) {
    const era = strings.quiz.eraFor(id, archetype);
    assert.ok(era.title.trim().length > 0, `eraFor(${id}) has an empty title`);
    assert.ok(era.description.trim().length > 0, `eraFor(${id}) has an empty description`);
    assert.match(era.title, new RegExp(archetype), `eraFor(${id}) should weave in the archetype`);
  }
});

test('eraFor fuses mood and archetype into a personal era name', () => {
  assert.equal(strings.quiz.eraFor('reset', 'Quiet Luxe').title, 'A Quiet Luxe Clean Slate');
  assert.equal(strings.quiz.eraFor('bold', 'Street').title, 'A Street Statement');
});

test('eraFor falls back to the reset era for an unknown mood id', () => {
  const known = strings.quiz.eraFor('reset', 'Quiet Luxe');
  const unknown = strings.quiz.eraFor('does-not-exist', 'Quiet Luxe');
  assert.deepEqual(unknown, known);
  assert.ok(unknown.title.trim().length > 0);
  assert.ok(unknown.description.trim().length > 0);
});

test('progressLabel reads as a plain step-of-total a11y label', () => {
  assert.equal(strings.quiz.progressLabel(3, 12), 'Step 3 of 12');
});

test('the style-quiz entry CTA is present as copy, not a hard-coded literal', () => {
  assert.equal(strings.quiz.entryCta, 'Take the style quiz');
});

// --- add a piece (closet flow) -----------------------------------------------

test('every add-a-piece string is present and non-empty', () => {
  const c = strings.closet;
  const leaves = [
    c.addCta,
    c.pickPhoto,
    c.takePhoto,
    c.uploading,
    c.processing,
    c.processedTitle,
    c.manualTitle,
    c.confirmCta,
    c.saved,
    c.addFailed,
    c.retryCta,
  ];
  for (const leaf of leaves) {
    assert.ok(leaf.trim().length > 0, `empty add-a-piece string: "${leaf}"`);
  }
});

test('every confirm-screen field label is a present, non-empty chip label', () => {
  const labels = strings.closet.fieldLabels;
  const keys = ['category', 'name', 'brand', 'colorPrimary', 'colors', 'pattern'] as const;
  assert.equal(Object.keys(labels).length, keys.length);
  for (const key of keys) {
    assert.ok(labels[key].trim().length > 0, `empty field label: ${key}`);
  }
});

test('fieldUnset returns a non-empty prompt that names the field or nudges an action', () => {
  for (const label of Object.values(strings.closet.fieldLabels)) {
    const prompt = strings.closet.fieldUnset(label);
    assert.ok(prompt.trim().length > 0, `fieldUnset(${label}) is empty`);
    const namesField = prompt.toLowerCase().includes(label.toLowerCase());
    const nudgesAction = /\b(add|set|choose|pick|tag)\b/i.test(prompt);
    assert.ok(
      namesField || nudgesAction,
      `fieldUnset(${label}) should name the field or nudge an action, got "${prompt}"`,
    );
  }
});

test('the manual-fallback title owns the miss without blaming the user', () => {
  const blamey = [/\byou (failed|didn't|forgot|messed)\b/i, /\byour fault\b/i, /\berror\b/i];
  for (const pattern of blamey) {
    assert.doesNotMatch(strings.closet.manualTitle, pattern);
  }
});
