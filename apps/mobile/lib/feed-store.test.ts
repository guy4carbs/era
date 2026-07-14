/**
 * Unit tests for the pure feed reducer + in-flight coalescing helpers. Plain Node
 * (`node --experimental-strip-types --test`), no device, no React — the store is
 * data-in/data-out by design. Coverage:
 *   - pageLoaded: append, dedupe by id (posts + hidden markers), never reorder,
 *     cursor → status ('end' at null)
 *   - optimistic → reconcile settles to server truth and drops the op
 *   - optimistic → revert restores the EXACT pre-tap values
 *   - two disjoint ops (like + save) on one post don't clobber on revert
 *   - hidePost replaces the slot in place (indices stable), keeps neighbours
 *   - blockCreator: current post → hidden in place, other posts by creator dropped
 *   - coalescing: registerTap starts one call, re-tap coalesces; settleFlight
 *     fires exactly one trailing write toward the latest desired
 *
 * Run: node --experimental-strip-types --test apps/mobile/lib/feed-store.test.ts
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { FeedPostPayload } from '@era/core/feed';
import {
  clearFlight,
  feedReducer,
  flightKey,
  initialFeedState,
  isHidden,
  registerTap,
  settleFlight,
  type FeedState,
  type FlightMap,
} from './feed-store.ts';

// --- fixtures ---------------------------------------------------------------

/** A feed post with overridable engagement + viewer bits. */
function post(id: string, over: Partial<FeedPostPayload> = {}): FeedPostPayload {
  return {
    id,
    type: 'outfit',
    coverUrl: `https://cdn.test/${id}.png`,
    title: `Look ${id}`,
    creator: { username: `user_${id}`, displayName: null, avatarUrl: null },
    likeCount: 5,
    saveCount: 2,
    viewer: { liked: false, saved: false, following: false },
    createdAt: '2026-07-14T00:00:00.000Z',
    ...over,
  };
}

/** A loaded state from a single page of the given posts (cursor set → idle). */
function loaded(posts: readonly FeedPostPayload[], nextCursor: string | null = 'cursor-1'): FeedState {
  return feedReducer(initialFeedState, { type: 'pageLoaded', posts, nextCursor });
}

// --- pageLoaded -------------------------------------------------------------

test('pageLoaded appends a page and sets the cursor (idle while more remain)', () => {
  const state = loaded([post('a'), post('b')], 'c1');
  assert.deepEqual(
    state.posts.map((s) => s.id),
    ['a', 'b'],
  );
  assert.equal(state.nextCursor, 'c1');
  assert.equal(state.status, 'idle');
});

test('pageLoaded with a null cursor marks the feed ended', () => {
  const state = loaded([post('a')], null);
  assert.equal(state.status, 'end');
  assert.equal(state.nextCursor, null);
});

test('pageLoaded dedupes by id and preserves existing order (never reorders)', () => {
  const first = loaded([post('a'), post('b')], 'c1');
  const second = feedReducer(first, {
    type: 'pageLoaded',
    posts: [post('b'), post('c'), post('a'), post('d')],
    nextCursor: 'c2',
  });
  assert.deepEqual(
    second.posts.map((s) => s.id),
    ['a', 'b', 'c', 'd'],
  );
});

test('pageLoaded never un-hides a post already hidden in place', () => {
  const first = loaded([post('a'), post('b')], 'c1');
  const hidden = feedReducer(first, { type: 'hidePost', postId: 'a' });
  const reloaded = feedReducer(hidden, { type: 'pageLoaded', posts: [post('a')], nextCursor: 'c2' });
  const slotA = reloaded.posts.find((s) => s.id === 'a');
  assert.ok(slotA && isHidden(slotA), 'post a stays a hidden marker after re-delivery');
  assert.equal(reloaded.posts.length, 2);
});

// --- optimistic + reconcile / revert ----------------------------------------

test('optimistic like flips the bit and bumps the count, recording one pending op', () => {
  const state = loaded([post('a')]);
  const next = feedReducer(state, { type: 'optimistic', opId: 'a:like', postId: 'a', action: 'like' });
  const slot = next.posts[0];
  assert.ok(slot && !isHidden(slot));
  assert.equal(slot.viewer.liked, true);
  assert.equal(slot.likeCount, 6);
  assert.equal(next.pendingOps.length, 1);
  assert.equal(next.pendingOps[0]?.opId, 'a:like');
});

test('optimistic → reconcile settles to the server counts and drops the op', () => {
  let state = loaded([post('a')]);
  state = feedReducer(state, { type: 'optimistic', opId: 'a:like', postId: 'a', action: 'like' });
  state = feedReducer(state, {
    type: 'reconcile',
    opId: 'a:like',
    postId: 'a',
    patch: { liked: true, likeCount: 9 },
  });
  const slot = state.posts[0];
  assert.ok(slot && !isHidden(slot));
  assert.equal(slot.likeCount, 9, 'settles to the server count, not the optimistic +1');
  assert.equal(slot.viewer.liked, true);
  assert.equal(state.pendingOps.length, 0);
});

test('optimistic → revert restores the EXACT pre-tap values', () => {
  const original = post('a', { likeCount: 5, viewer: { liked: false, saved: false, following: false } });
  let state = loaded([original]);
  state = feedReducer(state, { type: 'optimistic', opId: 'a:like', postId: 'a', action: 'like' });
  assert.equal((state.posts[0] as FeedPostPayload).likeCount, 6);
  state = feedReducer(state, { type: 'revert', opId: 'a:like', postId: 'a' });
  const slot = state.posts[0] as FeedPostPayload;
  assert.equal(slot.likeCount, 5);
  assert.equal(slot.viewer.liked, false);
  assert.equal(state.pendingOps.length, 0);
});

test('a re-tap during flight coalesces onto the same op, keeping the original snapshot', () => {
  const original = post('a', { likeCount: 5 });
  let state = loaded([original]);
  // tap → like (5→6), re-tap → unlike (6→5), both under the same opId.
  state = feedReducer(state, { type: 'optimistic', opId: 'a:like', postId: 'a', action: 'like' });
  state = feedReducer(state, { type: 'optimistic', opId: 'a:like', postId: 'a', action: 'like' });
  assert.equal((state.posts[0] as FeedPostPayload).viewer.liked, false);
  assert.equal((state.posts[0] as FeedPostPayload).likeCount, 5);
  assert.equal(state.pendingOps.length, 1, 'still exactly one pending op');
  // revert must restore the ORIGINAL pre-first-tap values, not the intermediate.
  state = feedReducer(state, { type: 'revert', opId: 'a:like', postId: 'a' });
  assert.equal((state.posts[0] as FeedPostPayload).likeCount, 5);
  assert.equal((state.posts[0] as FeedPostPayload).viewer.liked, false);
});

test('disjoint like + save ops on one post do not clobber on revert', () => {
  const original = post('a', { likeCount: 5, saveCount: 2 });
  let state = loaded([original]);
  state = feedReducer(state, { type: 'optimistic', opId: 'a:like', postId: 'a', action: 'like' });
  state = feedReducer(state, { type: 'optimistic', opId: 'a:save', postId: 'a', action: 'save' });
  assert.equal((state.posts[0] as FeedPostPayload).likeCount, 6);
  assert.equal((state.posts[0] as FeedPostPayload).saveCount, 3);
  // Revert only the like — the save's optimistic state must survive intact.
  state = feedReducer(state, { type: 'revert', opId: 'a:like', postId: 'a' });
  const slot = state.posts[0] as FeedPostPayload;
  assert.equal(slot.likeCount, 5);
  assert.equal(slot.viewer.liked, false);
  assert.equal(slot.saveCount, 3, 'save optimistic untouched');
  assert.equal(slot.viewer.saved, true);
  assert.equal(state.pendingOps.length, 1);
});

test('optimistic follow flips following with no count movement', () => {
  const state = loaded([post('a')]);
  const next = feedReducer(state, { type: 'optimistic', opId: 'a:follow', postId: 'a', action: 'follow' });
  const slot = next.posts[0] as FeedPostPayload;
  assert.equal(slot.viewer.following, true);
  assert.equal(slot.likeCount, 5);
  assert.equal(slot.saveCount, 2);
});

test('an optimistic op on a since-hidden post is a no-op', () => {
  let state = loaded([post('a')]);
  state = feedReducer(state, { type: 'hidePost', postId: 'a' });
  const next = feedReducer(state, { type: 'optimistic', opId: 'a:like', postId: 'a', action: 'like' });
  assert.equal(next.pendingOps.length, 0);
  assert.ok(isHidden(next.posts[0]!));
});

// --- hidePost / blockCreator (index stability) ------------------------------

test('hidePost replaces the slot in place and keeps every neighbour index', () => {
  const state = loaded([post('a'), post('b'), post('c')]);
  const next = feedReducer(state, { type: 'hidePost', postId: 'b' });
  assert.deepEqual(
    next.posts.map((s) => s.id),
    ['a', 'b', 'c'],
    'length and ids unchanged — indices are stable',
  );
  assert.ok(!isHidden(next.posts[0]!));
  assert.ok(isHidden(next.posts[1]!));
  assert.ok(!isHidden(next.posts[2]!));
});

test('blockCreator hides the current post in place and drops the creator\'s other posts', () => {
  const mara = { username: 'mara', displayName: 'Mara', avatarUrl: null };
  const state = loaded([
    post('a', { creator: mara }),
    post('b'),
    post('c', { creator: mara }),
    post('d', { creator: mara }),
  ]);
  const next = feedReducer(state, { type: 'blockCreator', username: 'mara', currentPostId: 'c' });
  assert.deepEqual(
    next.posts.map((s) => s.id),
    ['b', 'c'],
    'a and d (other mara posts) dropped; c hidden in place; b untouched',
  );
  const slotC = next.posts.find((s) => s.id === 'c');
  assert.ok(slotC && isHidden(slotC));
});

// --- setStatus --------------------------------------------------------------

test('setStatus sets the lifecycle status', () => {
  const state = loaded([post('a')]);
  assert.equal(feedReducer(state, { type: 'setStatus', status: 'loading' }).status, 'loading');
  assert.equal(feedReducer(state, { type: 'setStatus', status: 'error' }).status, 'error');
});

// --- coalescing helpers -----------------------------------------------------

test('flightKey is stable per (post, action) pair', () => {
  assert.equal(flightKey('a', 'like'), 'a:like');
  assert.notEqual(flightKey('a', 'like'), flightKey('a', 'save'));
});

test('registerTap starts a call only when none is running for the pair', () => {
  let map: FlightMap = new Map();
  const first = registerTap(map, 'a', 'like', true);
  assert.equal(first.shouldCall, true, 'first tap starts a call');
  map = first.map;
  const second = registerTap(map, 'a', 'like', false);
  assert.equal(second.shouldCall, false, 're-tap during flight coalesces (no new call)');
  map = second.map;
  // A different action on the same post is its own flight.
  assert.equal(registerTap(map, 'a', 'save', true).shouldCall, true);
});

test('settleFlight resolves cleanly when the settled value matches the latest desire', () => {
  const start = registerTap(new Map(), 'a', 'like', true);
  const settled = settleFlight(start.map, 'a', 'like', true);
  assert.equal(settled.trailing, null, 'no trailing call needed');
  assert.equal(settled.map.has(flightKey('a', 'like')), false, 'flight cleared');
});

test('settleFlight fires exactly one trailing call toward the latest desire after coalesced re-taps', () => {
  // tap → desired true (call fires), re-tap → desired false, re-tap → desired true.
  let map: FlightMap = new Map();
  map = registerTap(map, 'a', 'like', true).map;
  map = registerTap(map, 'a', 'like', false).map;
  map = registerTap(map, 'a', 'like', true).map;
  // The in-flight call (for `true`) settles at true, but the latest desire is true → done.
  const settled = settleFlight(map, 'a', 'like', true);
  assert.equal(settled.trailing, null);
});

test('settleFlight returns the trailing target when the first call is superseded', () => {
  // tap → true (call fires), re-tap → false (coalesced). Call settles at true,
  // but the viewer now wants false → one trailing call toward false.
  let map: FlightMap = new Map();
  map = registerTap(map, 'a', 'like', true).map;
  map = registerTap(map, 'a', 'like', false).map;
  const settled = settleFlight(map, 'a', 'like', true);
  assert.equal(settled.trailing, false, 'one trailing write toward the latest desire');
  assert.ok(settled.map.has(flightKey('a', 'like')), 'flight stays open for the trailing call');
});

test('clearFlight removes a pair (error path)', () => {
  const start = registerTap(new Map(), 'a', 'like', true);
  const cleared = clearFlight(start.map, 'a', 'like');
  assert.equal(cleared.has(flightKey('a', 'like')), false);
});
