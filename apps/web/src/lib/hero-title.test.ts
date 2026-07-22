import { test } from 'node:test';
import assert from 'node:assert/strict';
import { strings } from '@era/core/strings';
import { splitHeroTitle } from './hero-title.ts';

/**
 * The hero split is a PRESENTATION of the one locked title, never new copy. The
 * load-bearing invariant: rejoining the two lines with a single space must
 * reproduce `strings.site.hero.title` byte-for-byte. If the locked title is ever
 * re-approved, this test tracks it automatically (it reads the string, not a
 * copy of it).
 */

test('splitHeroTitle: the two lines rejoin to the locked title exactly', () => {
  const title = strings.site.hero.title;
  const lines = splitHeroTitle(title);
  assert.equal(lines.length, 2);
  assert.equal(lines.join(' '), title);
});

test('splitHeroTitle: both lines are non-empty for the locked title', () => {
  const [first, second] = splitHeroTitle(strings.site.hero.title);
  assert.ok(first.length > 0, 'first line must not be empty');
  assert.ok(second.length > 0, 'second line must not be empty');
});

test('splitHeroTitle: a single word returns it whole with an empty second line', () => {
  assert.deepEqual(splitHeroTitle('Era'), ['Era', '']);
});
