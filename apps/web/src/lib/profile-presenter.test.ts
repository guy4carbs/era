/**
 * Unit tests for the pure public-profile presenter helpers — no DB, no network.
 *
 * Run: node --experimental-strip-types --test apps/web/src/lib/profile-presenter.test.ts
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  PUBLIC_PROFILE_MIN_ITEMS,
  coverAlt,
  isThinProfile,
  itemAlt,
  profileName,
  profileTitle,
} from './profile-presenter.ts';

test('profileName prefers a trimmed display name, else the username', () => {
  assert.equal(profileName({ displayName: 'Mara Lin', username: 'mara' }), 'Mara Lin');
  assert.equal(profileName({ displayName: '  Mara  ', username: 'mara' }), 'Mara');
  assert.equal(profileName({ displayName: '   ', username: 'mara' }), 'mara');
  assert.equal(profileName({ displayName: null, username: 'mara' }), 'mara');
});

test('profileTitle formats "Name (@user)" or "@user", capped at 60 chars', () => {
  assert.equal(profileTitle({ displayName: 'Mara Lin', username: 'mara' }), 'Mara Lin (@mara)');
  assert.equal(profileTitle({ displayName: null, username: 'mara' }), '@mara');

  const long = profileTitle({ displayName: 'X'.repeat(80), username: 'mara' });
  assert.ok(long.length <= 60, `title must be <=60, got ${long.length}`);
  assert.ok(long.endsWith('…'), 'an overlong title is truncated with an ellipsis');
});

test('isThinProfile gates on the shared minimum-items bar', () => {
  assert.equal(PUBLIC_PROFILE_MIN_ITEMS, 5);
  assert.equal(isThinProfile(0), true);
  assert.equal(isThinProfile(PUBLIC_PROFILE_MIN_ITEMS - 1), true);
  assert.equal(isThinProfile(PUBLIC_PROFILE_MIN_ITEMS), false);
  assert.equal(isThinProfile(42), false);
});

test('itemAlt composes name with category + colour tags, falling back cleanly', () => {
  assert.equal(
    itemAlt({ name: 'Wool overcoat', category: 'outerwear', color: 'camel' }),
    'Wool overcoat — outerwear, camel',
  );
  assert.equal(itemAlt({ name: 'Loafers', category: 'shoes', color: null }), 'Loafers — shoes');
  assert.equal(itemAlt({ name: 'Piece', category: '', color: '   ' }), 'Piece');
  assert.equal(itemAlt({ name: '  ', category: '', color: null }), 'A closet piece');
});

test('coverAlt scopes the cover title by the owner, or a fallback when untitled', () => {
  assert.equal(coverAlt('Mara Lin', 'Autumn in Copenhagen', 'an era'), 'Mara Lin — Autumn in Copenhagen');
  assert.equal(coverAlt('Mara Lin', null, 'an outfit'), 'Mara Lin — an outfit');
  assert.equal(coverAlt('Mara Lin', '   ', 'an era'), 'Mara Lin — an era');
});
