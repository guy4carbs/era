/**
 * The Era Edit's render contract test.
 *
 * The two shapes this template ships: the personalized send (with the recipient's
 * Your Week, Worn stats) and the waitlist broadcast (no stats). The tests assert:
 *   - weekWorn present → 'Your Week, Worn' + the stat lines render.
 *   - weekWorn null → 'Your Week, Worn' is ABSENT (no spacer artifact section).
 *   - the hero's full-sentence alt survives (images-off accessibility).
 *   - the masthead, every section label, all four formula lines, and the dispatch
 *     survive the PLAIN-TEXT render (the images-off rule — the words carry alone).
 *   - both footer links (unsubscribe + preferences) are present in the HTML.
 *   - the dispatch appears exactly once.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createElement } from 'react';

import { strings } from '@era/core/strings';

import { renderEmail } from './render.ts';
import { issue001 } from './issues/issue-001.ts';
import { TheEraEdit, type WeekWornData } from './templates/the-era-edit.tsx';

const copy = strings.emails.theEraEdit;

const UNSUB = 'https://era.style/api/email/unsubscribe?email=you%40example.com&token=t';
const PREFS = 'https://era.style/email/preferences?email=you%40example.com&token=t';

const WEEK_WORN: WeekWornData = {
  mostWorn: { name: 'linen shirt', count: 4 },
  costPerWear: { name: 'linen shirt', formatted: '$12.50' },
};

function withWeek() {
  return createElement(TheEraEdit, {
    issue: issue001,
    weekWorn: WEEK_WORN,
    unsubscribeUrl: UNSUB,
    preferencesUrl: PREFS,
  });
}

function withoutWeek() {
  return createElement(TheEraEdit, {
    issue: issue001,
    weekWorn: null,
    unsubscribeUrl: UNSUB,
    preferencesUrl: PREFS,
  });
}

test('weekWorn present → Your Week, Worn section and its stat lines render', async () => {
  const { text } = await renderEmail(withWeek());

  assert.ok(text.includes(copy.sections.weekWorn), 'Your Week, Worn label present');
  assert.ok(
    text.includes(copy.mostWorn(WEEK_WORN.mostWorn.name, WEEK_WORN.mostWorn.count)),
    'most-worn stat line present',
  );
  assert.ok(
    text.includes(copy.costPerWear(WEEK_WORN.costPerWear!.name, WEEK_WORN.costPerWear!.formatted)),
    'cost-per-wear stat line present',
  );
});

test('weekWorn null → Your Week, Worn is entirely absent', async () => {
  const { html, text } = await renderEmail(withoutWeek());

  assert.ok(!html.includes(copy.sections.weekWorn), 'Your Week, Worn label absent from html');
  assert.ok(!text.includes(copy.sections.weekWorn), 'Your Week, Worn label absent from text');
  // No stat sentence fragment leaks in either.
  assert.ok(!text.includes('led the week'), 'no most-worn sentence in the waitlist variant');
});

test('the hero alt sentence survives (images-off accessibility)', async () => {
  const { html } = await renderEmail(withWeek());
  assert.ok(html.includes(issue001.hero.alt), 'full-sentence hero alt present');
});

test('masthead, all section labels, all four formula lines, and the dispatch are in the plain text', async () => {
  const { text } = await renderEmail(withWeek());

  assert.ok(text.includes(copy.masthead), 'masthead present');
  assert.ok(text.includes(copy.sections.formula), 'The Formula label present');
  assert.ok(text.includes(copy.sections.weekWorn), 'Your Week, Worn label present');
  assert.ok(text.includes(copy.sections.dispatch), 'The Dispatch label present');

  for (const line of issue001.formula.lines) {
    assert.ok(text.includes(line), `formula line present: ${line}`);
  }
  assert.equal(issue001.formula.lines.length, 4, 'issue 001 has four formula lines');

  assert.ok(text.includes(issue001.dispatch), 'dispatch line present');
});

test('both footer links (unsubscribe + preferences) are in the html', async () => {
  const { html } = await renderEmail(withWeek());
  assert.ok(html.includes(strings.emails.footer.unsubscribe), 'Unsubscribe label present');
  assert.ok(html.includes(copy.preferences), 'Preferences label present');
  // The signed URLs themselves survive (react-email escapes & → &amp; in hrefs).
  assert.ok(html.includes('/api/email/unsubscribe'), 'unsubscribe href present');
  assert.ok(html.includes('/email/preferences'), 'preferences href present');
});

test('the dispatch appears exactly once', async () => {
  const { text } = await renderEmail(withWeek());
  const occurrences = text.split(issue001.dispatch).length - 1;
  assert.equal(occurrences, 1, 'dispatch rendered exactly once');
});
