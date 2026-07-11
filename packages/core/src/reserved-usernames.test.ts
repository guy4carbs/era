/**
 * Unit tests for the reserved-username list + guard. Assert that live route
 * names are reserved, that ordinary handles are not, that the check is
 * case-insensitive, and that a non-string is never reserved.
 *
 * Run: node --experimental-strip-types --test src/reserved-usernames.test.ts
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { RESERVED_USERNAMES, isReservedUsername } from './reserved-usernames.ts';

test('the app top-level route names the task enumerates are all reserved', () => {
  const routes = [
    'check',
    'closet',
    'design',
    'design-lab',
    'onboarding',
    'quiz',
    'settings',
    'sign-in',
    'worn',
    'feed',
    'shop',
    'api',
    'sitemap.xml',
    'robots.txt',
    'privacy',
    'terms',
    'u',
    'profile',
    'admin',
    'era',
    'eras',
  ];
  for (const route of routes) {
    assert.equal(isReservedUsername(route), true, `expected "${route}" to be reserved`);
  }
});

test('ordinary handles are not reserved', () => {
  for (const handle of ['guy', 'sara_k', 'wardrobe_wizard', 'era_fan_92', 'jules']) {
    assert.equal(isReservedUsername(handle), false, `expected "${handle}" to be claimable`);
  }
});

test('the check is case-insensitive (usernames are lowercased, but guard is defensive)', () => {
  assert.equal(isReservedUsername('ADMIN'), true);
  assert.equal(isReservedUsername('Settings'), true);
  assert.equal(isReservedUsername('Api'), true);
});

test('a non-string is never reserved', () => {
  for (const value of [null, undefined, 42, {}, [], true]) {
    assert.equal(isReservedUsername(value), false);
  }
});

test('the exported set is non-empty and holds lowercase entries only', () => {
  assert.ok(RESERVED_USERNAMES.size > 0);
  for (const entry of RESERVED_USERNAMES) {
    assert.equal(entry, entry.toLowerCase(), `entry "${entry}" must be stored lowercase`);
  }
});
