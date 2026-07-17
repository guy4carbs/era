/**
 * Unit tests for the pure avatar photo-step logic. Plain Node
 * (`node --experimental-strip-types --test`), no device, no expo SDK — the resize
 * planner and the picked-list helpers are data-in/data-out by design. Coverage:
 *   - resize: landscape scales off width, portrait off height, square off width
 *   - resize: an already-small photo and unknown/garbage dimensions → no resize
 *   - list: append caps at 3, de-dupes by uri, removes by index (bounds-safe)
 *   - guards: canAdd flips at 3, canCreate flips at 1
 *
 * Run: node --experimental-strip-types --test apps/mobile/lib/avatar-photo.test.ts
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  MAX_AVATAR_EDGE,
  MAX_AVATAR_PHOTOS,
  addAvatarPhoto,
  avatarResizeActions,
  canAddAvatarPhoto,
  canCreateAvatar,
  removeAvatarPhotoAt,
  type AvatarPhoto,
} from './avatar-photo.ts';

test('landscape photo scales off the width (the long edge)', () => {
  assert.deepEqual(avatarResizeActions(4000, 3000), [{ resize: { width: MAX_AVATAR_EDGE } }]);
});

test('portrait photo scales off the height (the long edge)', () => {
  assert.deepEqual(avatarResizeActions(3000, 4000), [{ resize: { height: MAX_AVATAR_EDGE } }]);
});

test('square photo scales off the width (tie goes to width)', () => {
  assert.deepEqual(avatarResizeActions(2400, 2400), [{ resize: { width: MAX_AVATAR_EDGE } }]);
});

test('a photo already within the cap is not resized', () => {
  assert.deepEqual(avatarResizeActions(1200, 900), []);
  assert.deepEqual(avatarResizeActions(MAX_AVATAR_EDGE, 800), []);
});

test('unknown or garbage dimensions yield no resize (re-encode still strips EXIF)', () => {
  assert.deepEqual(avatarResizeActions(0, 0), []);
  assert.deepEqual(avatarResizeActions(Number.NaN, 4000), []);
  assert.deepEqual(avatarResizeActions(-100, 5000), []);
});

test('append caps at the max and de-dupes by uri', () => {
  let list: readonly AvatarPhoto[] = [];
  list = addAvatarPhoto(list, 'a');
  list = addAvatarPhoto(list, 'a'); // duplicate — ignored
  list = addAvatarPhoto(list, 'b');
  list = addAvatarPhoto(list, 'c');
  list = addAvatarPhoto(list, 'd'); // over the cap — ignored
  assert.deepEqual(
    list.map((p) => p.uri),
    ['a', 'b', 'c'],
  );
  assert.equal(list.length, MAX_AVATAR_PHOTOS);
});

test('remove by index is bounds-safe', () => {
  const list: readonly AvatarPhoto[] = [{ uri: 'a' }, { uri: 'b' }, { uri: 'c' }];
  assert.deepEqual(
    removeAvatarPhotoAt(list, 1).map((p) => p.uri),
    ['a', 'c'],
  );
  assert.deepEqual(removeAvatarPhotoAt(list, 9).map((p) => p.uri), ['a', 'b', 'c']);
  assert.deepEqual(removeAvatarPhotoAt(list, -1).map((p) => p.uri), ['a', 'b', 'c']);
});

test('count guards flip at their bounds', () => {
  assert.equal(canAddAvatarPhoto([]), true);
  assert.equal(canAddAvatarPhoto([{ uri: 'a' }, { uri: 'b' }, { uri: 'c' }]), false);
  assert.equal(canCreateAvatar([]), false);
  assert.equal(canCreateAvatar([{ uri: 'a' }]), true);
});
