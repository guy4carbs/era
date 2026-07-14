/**
 * Feed store — a pure, framework-free reducer for the mobile feed pager.
 *
 * NO React, NO reanimated, NO IO: this is plain data-in/data-out so it runs under
 * `node --experimental-strip-types --test` exactly like `purchases.ts`. The
 * {@link FeedProvider} wraps it in a `useReducer` and drives the side effects
 * (API calls, toasts); every state transition the feed can make lives HERE, where
 * it can be reasoned about and tested without a device.
 *
 * The design constraint that shapes everything: the pager keys its three mounted
 * children by array index, so **a post's slot must never move**. Reporting or
 * blocking therefore does not splice the array (that would shift every index
 * below it and snap the pager); instead the acted-on slot is replaced IN PLACE by
 * a {@link HiddenMarker}. Pagination only ever APPENDS. Existing posts are never
 * reordered.
 *
 * Optimism model: a tap flips the viewer bit and bumps the count immediately
 * (`optimistic`), records the pre-tap values as a {@link PendingOp} keyed by an
 * opId, then the provider either settles it to the server's truth (`reconcile`)
 * or restores it exactly (`revert`). The three actions (like/save/follow) touch
 * DISJOINT fields, so their in-flight ops never clobber each other — a failed
 * like-revert can't undo an in-flight save.
 */
import type { FeedPostPayload } from '@era/core/feed';

/**
 * A slot whose post has been hidden in place (reported or blocked). It keeps the
 * post's id so the pager's index→id keying is stable, but carries no content —
 * the card renders the "post hidden" placeholder. `hidden: true` is the
 * discriminant {@link isHidden} narrows on.
 */
export interface HiddenMarker {
  readonly hidden: true;
  readonly id: string;
}

/** One entry in the pager: either a full post or a hidden-in-place marker. */
export type FeedSlot = FeedPostPayload | HiddenMarker;

/** Narrow a slot to the hidden marker (so a post is `!isHidden(slot)`). */
export function isHidden(slot: FeedSlot): slot is HiddenMarker {
  return (slot as Partial<HiddenMarker>).hidden === true;
}

/**
 * The three optimistic actions a viewer can take on a post. Each owns a disjoint
 * pair of fields: `like` → (viewer.liked, likeCount), `save` → (viewer.saved,
 * saveCount), `follow` → (viewer.following). The disjointness is what lets two of
 * them be in flight on the same post without their reverts interfering.
 */
export type FeedAction = 'like' | 'save' | 'follow';

/**
 * The pre-tap snapshot for one optimistic op, held until the op settles. `revert`
 * restores only the fields its {@link FeedAction} owns, so restoring a like never
 * clobbers a concurrent save. Keyed by `opId` — the provider uses a stable
 * `${postId}:${action}` key so a re-tap during flight coalesces onto the SAME op
 * and keeps this original snapshot (the true server-backed values to fall back to).
 */
export interface PendingOp {
  readonly opId: string;
  readonly postId: string;
  readonly action: FeedAction;
  readonly prevLiked: boolean;
  readonly prevSaved: boolean;
  readonly prevFollowing: boolean;
  readonly prevLikeCount: number;
  readonly prevSaveCount: number;
}

/**
 * Feed lifecycle status. `idle` = ready/loaded with more to come, `loading` = a
 * page request is in flight, `error` = the last page request failed (retryable),
 * `end` = the server returned a null cursor (no more pages — show the end line).
 */
export type FeedStatus = 'idle' | 'loading' | 'error' | 'end';

/** The whole feed state the pager renders from. Immutable — every action returns a fresh object. */
export interface FeedState {
  readonly posts: readonly FeedSlot[];
  readonly nextCursor: string | null;
  readonly status: FeedStatus;
  readonly pendingOps: readonly PendingOp[];
}

/** The empty starting state — no posts, no cursor yet, idle. */
export const initialFeedState: FeedState = {
  posts: [],
  nextCursor: null,
  status: 'idle',
  pendingOps: [],
};

/** The server-authoritative values a settled write returns, applied by `reconcile`. */
export interface ReconcilePatch {
  readonly liked?: boolean;
  readonly saved?: boolean;
  readonly following?: boolean;
  readonly likeCount?: number;
  readonly saveCount?: number;
}

/**
 * Every transition the feed can make. Deliberately small and explicit so the
 * pager and provider share one vocabulary:
 *  - `pageLoaded` — append a fetched page (dedupe by id, never reorder), set cursor.
 *  - `optimistic` — flip a viewer bit + bump its count for `action` on `postId`,
 *     recording the pre-tap snapshot under `opId` (idempotent per opId).
 *  - `reconcile` — settle `opId` to the server's returned values and drop the op.
 *  - `revert` — restore `opId`'s action fields to their pre-tap values and drop it.
 *  - `hidePost` — replace one slot with a hidden marker in place (report flow).
 *  - `blockCreator` — hide the current post in place, drop the creator's OTHER posts.
 *  - `setStatus` — set the lifecycle status (loading before a fetch, error on fail).
 */
export type FeedEvent =
  | { readonly type: 'pageLoaded'; readonly posts: readonly FeedPostPayload[]; readonly nextCursor: string | null }
  | { readonly type: 'optimistic'; readonly opId: string; readonly postId: string; readonly action: FeedAction }
  | { readonly type: 'reconcile'; readonly opId: string; readonly postId: string; readonly patch: ReconcilePatch }
  | { readonly type: 'revert'; readonly opId: string; readonly postId: string }
  | { readonly type: 'hidePost'; readonly postId: string }
  | { readonly type: 'blockCreator'; readonly username: string; readonly currentPostId: string }
  | { readonly type: 'setStatus'; readonly status: FeedStatus };

/** True when a post (not a hidden marker) with this id already occupies a slot. */
function slotId(slot: FeedSlot): string {
  return slot.id;
}

/**
 * Apply an optimistic flip for `action` to `post`, returning the mutated post.
 * Toggles the action's viewer bit and moves its count by ±1 (follow has no count).
 * Counts never fall below zero.
 */
function applyFlip(post: FeedPostPayload, action: FeedAction): FeedPostPayload {
  switch (action) {
    case 'like': {
      const liked = !post.viewer.liked;
      return {
        ...post,
        viewer: { ...post.viewer, liked },
        likeCount: Math.max(0, post.likeCount + (liked ? 1 : -1)),
      };
    }
    case 'save': {
      const saved = !post.viewer.saved;
      return {
        ...post,
        viewer: { ...post.viewer, saved },
        saveCount: Math.max(0, post.saveCount + (saved ? 1 : -1)),
      };
    }
    case 'follow':
      return { ...post, viewer: { ...post.viewer, following: !post.viewer.following } };
  }
}

/** Restore the fields `op.action` owns from its pre-tap snapshot. */
function applyRevert(post: FeedPostPayload, op: PendingOp): FeedPostPayload {
  switch (op.action) {
    case 'like':
      return { ...post, viewer: { ...post.viewer, liked: op.prevLiked }, likeCount: op.prevLikeCount };
    case 'save':
      return { ...post, viewer: { ...post.viewer, saved: op.prevSaved }, saveCount: op.prevSaveCount };
    case 'follow':
      return { ...post, viewer: { ...post.viewer, following: op.prevFollowing } };
  }
}

/** Apply the server's returned values to a post (only the fields present in the patch). */
function applyReconcile(post: FeedPostPayload, patch: ReconcilePatch): FeedPostPayload {
  return {
    ...post,
    likeCount: patch.likeCount ?? post.likeCount,
    saveCount: patch.saveCount ?? post.saveCount,
    viewer: {
      liked: patch.liked ?? post.viewer.liked,
      saved: patch.saved ?? post.viewer.saved,
      following: patch.following ?? post.viewer.following,
    },
  };
}

/**
 * The feed reducer. Pure: `(state, event) → state`, never mutates its inputs,
 * never touches IO. Unknown or inapplicable events (e.g. an op on a since-hidden
 * post) return the state unchanged.
 */
export function feedReducer(state: FeedState, event: FeedEvent): FeedState {
  switch (event.type) {
    case 'pageLoaded': {
      // Append only what we don't already have (by id — including hidden markers,
      // so a re-delivered post never un-hides). Existing order is never touched.
      const seen = new Set(state.posts.map(slotId));
      const fresh = event.posts.filter((post) => !seen.has(post.id));
      const nextStatus: FeedStatus = event.nextCursor === null ? 'end' : 'idle';
      return {
        ...state,
        posts: [...state.posts, ...fresh],
        nextCursor: event.nextCursor,
        status: nextStatus,
      };
    }

    case 'optimistic': {
      // Coalesce: if an op with this id is already pending, keep its original
      // snapshot (the true fallback) and just flip the UI again.
      const existing = state.pendingOps.find((op) => op.opId === event.opId);
      let flipped = false;
      const posts = state.posts.map((slot) => {
        if (isHidden(slot) || slot.id !== event.postId) return slot;
        flipped = true;
        return applyFlip(slot, event.action);
      });
      if (!flipped) return state; // post gone (hidden/blocked) — nothing to flip

      if (existing) {
        return { ...state, posts };
      }
      // Snapshot the pre-tap values off the ORIGINAL slot for an exact revert.
      const original = state.posts.find(
        (slot): slot is FeedPostPayload => !isHidden(slot) && slot.id === event.postId,
      );
      if (!original) return { ...state, posts };
      const op: PendingOp = {
        opId: event.opId,
        postId: event.postId,
        action: event.action,
        prevLiked: original.viewer.liked,
        prevSaved: original.viewer.saved,
        prevFollowing: original.viewer.following,
        prevLikeCount: original.likeCount,
        prevSaveCount: original.saveCount,
      };
      return { ...state, posts, pendingOps: [...state.pendingOps, op] };
    }

    case 'reconcile': {
      const posts = state.posts.map((slot) =>
        !isHidden(slot) && slot.id === event.postId ? applyReconcile(slot, event.patch) : slot,
      );
      return {
        ...state,
        posts,
        pendingOps: state.pendingOps.filter((op) => op.opId !== event.opId),
      };
    }

    case 'revert': {
      const op = state.pendingOps.find((candidate) => candidate.opId === event.opId);
      if (!op) return state;
      const posts = state.posts.map((slot) =>
        !isHidden(slot) && slot.id === event.postId ? applyRevert(slot, op) : slot,
      );
      return {
        ...state,
        posts,
        pendingOps: state.pendingOps.filter((candidate) => candidate.opId !== event.opId),
      };
    }

    case 'hidePost': {
      const posts = state.posts.map((slot) =>
        slot.id === event.postId ? ({ hidden: true, id: slot.id } as HiddenMarker) : slot,
      );
      return { ...state, posts };
    }

    case 'blockCreator': {
      // The post the viewer acted on is hidden IN PLACE (its index is on screen);
      // every OTHER post by the same creator is dropped from the stream.
      const posts: FeedSlot[] = [];
      for (const slot of state.posts) {
        if (slot.id === event.currentPostId) {
          posts.push({ hidden: true, id: slot.id });
          continue;
        }
        if (!isHidden(slot) && slot.creator.username === event.username) {
          continue; // drop other posts by the blocked creator
        }
        posts.push(slot);
      }
      return { ...state, posts };
    }

    case 'setStatus':
      return { ...state, status: event.status };
  }
}

// --- in-flight coalescing helpers (used by FeedProvider, pure + testable) -----

/** The stable op/flight key for a (post, action) pair — one in-flight op per pair. */
export function flightKey(postId: string, action: FeedAction): string {
  return `${postId}:${action}`;
}

/**
 * One (post, action) pair's in-flight bookkeeping. `desired` is the end-state the
 * MOST RECENT tap wants (the server boolean, e.g. liked=true); a call is always
 * running while an entry exists. When a call settles at a value other than the
 * current `desired`, a single trailing call is fired toward `desired` — that is
 * the "coalesce many taps into one trailing write" rule.
 */
export interface Flight {
  readonly desired: boolean;
}

/** The provider's in-flight registry, keyed by {@link flightKey}. */
export type FlightMap = ReadonlyMap<string, Flight>;

/**
 * Record a tap toward `desired`. Returns the next map plus whether the provider
 * should START a call now: it starts one only when no call is already running for
 * this pair (otherwise the running call will pick up the new `desired` on settle).
 */
export function registerTap(
  map: FlightMap,
  postId: string,
  action: FeedAction,
  desired: boolean,
): { readonly map: FlightMap; readonly shouldCall: boolean } {
  const key = flightKey(postId, action);
  const running = map.has(key);
  const next = new Map(map);
  next.set(key, { desired });
  return { map: next, shouldCall: !running };
}

/**
 * Settle a call that resolved at `settledValue`. If the pair's latest `desired`
 * still matches, the pair is done (entry removed, `trailing: null`). If a re-tap
 * moved `desired` since, the entry stays and `trailing` carries the value the
 * provider must now call toward — exactly one trailing write, no matter how many
 * intervening taps.
 */
export function settleFlight(
  map: FlightMap,
  postId: string,
  action: FeedAction,
  settledValue: boolean,
): { readonly map: FlightMap; readonly trailing: boolean | null } {
  const key = flightKey(postId, action);
  const entry = map.get(key);
  const next = new Map(map);
  if (!entry || entry.desired === settledValue) {
    next.delete(key);
    return { map: next, trailing: null };
  }
  return { map: next, trailing: entry.desired };
}

/** Clear a pair's flight entry (used when a call errors and the op is reverted). */
export function clearFlight(map: FlightMap, postId: string, action: FeedAction): FlightMap {
  const next = new Map(map);
  next.delete(flightKey(postId, action));
  return next;
}
