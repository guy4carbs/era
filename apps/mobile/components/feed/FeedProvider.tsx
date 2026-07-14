/**
 * FeedProvider — the context that turns taps into optimistic state + API calls.
 *
 * Holds the pure {@link feedReducer} in a `useReducer` and drives every side
 * effect around it: a like/save/follow tap flips the UI immediately, fires the
 * write, then either reconciles to the server's counts or reverts and toasts.
 * Concurrency is handled with the store's flight helpers — one write in flight per
 * (post, action), and a re-tap during flight coalesces into exactly one TRAILING
 * write toward the latest desired state (no request-per-tap storm).
 *
 * It also owns the two per-post sheets (shop-similar, more-menu) and the toast,
 * rendering them over `children` so the feed screen only mounts the pager. The
 * `USE_FIXTURES` switch feeds {@link FIXTURE_POSTS} instead of the network so the
 * pager is FPS-testable before the server route lands (the sequencing checkpoint).
 */
import { strings } from '@era/core/strings';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type PropsWithChildren,
} from 'react';

import type { FeedPostPayload } from '@era/core/feed';
import { layout, spacing } from '@era/tokens';

import { Toast } from '@/components/closet';
import { LimitReachedError } from '@/lib/rate-limit';
import {
  clearFlight,
  feedReducer,
  flightKey,
  initialFeedState,
  registerTap,
  settleFlight,
  type FeedAction,
  type FeedSlot,
  type FeedStatus,
  type FlightMap,
  type ReconcilePatch,
} from '@/lib/feed-store';

import {
  fetchFeed,
  followUser,
  likePost,
  savePost,
  unfollowUser,
  unlikePost,
  unsavePost,
} from './api';
import { FIXTURE_POSTS } from './fixtures';
import { ShopSimilarSheet } from './ShopSimilarSheet';
import { MoreMenuSheet } from './MoreMenuSheet';

/**
 * Fixture mode. `true` feeds the 30 static {@link FIXTURE_POSTS} and disables
 * pagination + writes-that-need-a-server, so the pager can be profiled with no
 * backend. Flip to `false` (the default) once the feed API is live in the preview
 * env — engagement then hits the real routes. See the report's FPS instructions.
 */
const USE_FIXTURES = false;

/** How close to the end of the loaded posts before we fetch the next page. */
const PREFETCH_THRESHOLD = 4;

interface FeedContextValue {
  readonly posts: readonly FeedSlot[];
  readonly status: FeedStatus;
  /** Double-tap and rail-tap like. `likeOnly` never unlikes (double-tap semantics). */
  readonly toggleLike: (post: FeedPostPayload) => void;
  readonly likeOnly: (post: FeedPostPayload) => void;
  readonly toggleSave: (post: FeedPostPayload) => void;
  readonly toggleFollow: (post: FeedPostPayload) => void;
  /** Fetch the next page if one is due (called by the pager near the end). */
  readonly loadMore: () => void;
  readonly openShopSimilar: (post: FeedPostPayload) => void;
  readonly openMore: (post: FeedPostPayload) => void;
}

const FeedContext = createContext<FeedContextValue | null>(null);

export function FeedProvider({ children }: PropsWithChildren) {
  const [state, dispatch] = useReducer(feedReducer, initialFeedState);
  const [toast, setToast] = useState<string | null>(null);
  const [shopSimilarPost, setShopSimilarPost] = useState<FeedPostPayload | null>(null);
  const [morePost, setMorePost] = useState<FeedPostPayload | null>(null);

  // Latest state + flight registry, read inside async callbacks without re-binding.
  const stateRef = useRef(state);
  stateRef.current = state;
  const flightsRef = useRef<FlightMap>(new Map());

  // Initial page: fixtures (one static page) or the first network page.
  useEffect(() => {
    if (USE_FIXTURES) {
      dispatch({ type: 'pageLoaded', posts: FIXTURE_POSTS, nextCursor: null });
      return;
    }
    // Mount-only: loadMore reads the latest state through stateRef.
    loadMore();
  }, []);

  const loadMore = useCallback(() => {
    if (USE_FIXTURES) return;
    const current = stateRef.current;
    if (current.status === 'loading' || current.status === 'end') return;
    // Nothing loaded yet is the initial load; after that, stop at a null cursor.
    if (current.posts.length > 0 && current.nextCursor === null) return;

    dispatch({ type: 'setStatus', status: 'loading' });
    void (async () => {
      try {
        const page = await fetchFeed(current.nextCursor);
        dispatch({ type: 'pageLoaded', posts: page.posts, nextCursor: page.nextCursor });
      } catch {
        dispatch({ type: 'setStatus', status: 'error' });
      }
    })();
  }, []);

  /** The server call for one action toward a desired end-state → its reconcile patch. */
  const callFor = useCallback(
    async (post: FeedPostPayload, action: FeedAction, desired: boolean): Promise<ReconcilePatch> => {
      switch (action) {
        case 'like': {
          const r = desired ? await likePost(post.id) : await unlikePost(post.id);
          return { liked: r.liked, likeCount: r.count };
        }
        case 'save': {
          const r = desired ? await savePost(post.id) : await unsavePost(post.id);
          return { saved: r.saved, saveCount: r.count };
        }
        case 'follow': {
          const r = desired
            ? await followUser(post.creator.username)
            : await unfollowUser(post.creator.username);
          return { following: r.following };
        }
      }
    },
    [],
  );

  /** Run (and, if superseded by a re-tap, trail) one write to completion. */
  const runCall = useCallback(
    async (post: FeedPostPayload, action: FeedAction, desired: boolean, opId: string): Promise<void> => {
      try {
        const patch = await callFor(post, action, desired);
        const { map, trailing } = settleFlight(flightsRef.current, post.id, action, desired);
        flightsRef.current = map;
        if (trailing === null) {
          dispatch({ type: 'reconcile', opId, postId: post.id, patch });
        } else {
          // A tap during flight moved the target — one trailing write reaches it.
          await runCall(post, action, trailing, opId);
        }
      } catch (error) {
        flightsRef.current = clearFlight(flightsRef.current, post.id, action);
        dispatch({ type: 'revert', opId, postId: post.id });
        const message =
          error instanceof LimitReachedError
            ? (error.serverMessage ?? strings.errors.generic)
            : strings.errors.generic;
        setToast(message);
      }
    },
    [callFor],
  );

  /** Flip a bit optimistically, then start (or coalesce onto) its write. */
  const apply = useCallback(
    (post: FeedPostPayload, action: FeedAction) => {
      if (USE_FIXTURES) return; // fixtures have no server to persist to
      const opId = flightKey(post.id, action);
      // Desired follows the LATEST intent: the running flight's target if any,
      // else the post's current bit — so rapid taps alternate correctly.
      const running = flightsRef.current.get(opId);
      const currentBit = running
        ? running.desired
        : action === 'like'
          ? post.viewer.liked
          : action === 'save'
            ? post.viewer.saved
            : post.viewer.following;
      const desired = !currentBit;

      dispatch({ type: 'optimistic', opId, postId: post.id, action });
      const { map, shouldCall } = registerTap(flightsRef.current, post.id, action, desired);
      flightsRef.current = map;
      if (shouldCall) {
        void runCall(post, action, desired, opId);
      }
    },
    [runCall],
  );

  const toggleLike = useCallback((post: FeedPostPayload) => apply(post, 'like'), [apply]);
  const toggleSave = useCallback((post: FeedPostPayload) => apply(post, 'save'), [apply]);
  const toggleFollow = useCallback((post: FeedPostPayload) => apply(post, 'follow'), [apply]);
  // Double-tap likes but never unlikes — the burst still plays, the state holds.
  const likeOnly = useCallback(
    (post: FeedPostPayload) => {
      if (post.viewer.liked) return;
      apply(post, 'like');
    },
    [apply],
  );

  const openShopSimilar = useCallback((post: FeedPostPayload) => setShopSimilarPost(post), []);
  const openMore = useCallback((post: FeedPostPayload) => setMorePost(post), []);

  const value = useMemo<FeedContextValue>(
    () => ({
      posts: state.posts,
      status: state.status,
      toggleLike,
      likeOnly,
      toggleSave,
      toggleFollow,
      loadMore,
      openShopSimilar,
      openMore,
    }),
    [state.posts, state.status, toggleLike, likeOnly, toggleSave, toggleFollow, loadMore, openShopSimilar, openMore],
  );

  return (
    <FeedContext.Provider value={value}>
      {children}

      <ShopSimilarSheet postId={shopSimilarPost?.id ?? null} onClose={() => setShopSimilarPost(null)} />
      <MoreMenuSheet
        post={morePost}
        onClose={() => setMorePost(null)}
        onReported={(postId) => {
          setMorePost(null);
          dispatch({ type: 'hidePost', postId });
          setToast(strings.feed.reportConfirm);
        }}
        onBlocked={(username, currentPostId) => {
          setMorePost(null);
          dispatch({ type: 'blockCreator', username, currentPostId });
          setToast(strings.feed.blockedConfirm);
        }}
      />
      <Toast message={toast} onHide={() => setToast(null)} bottom={layout.tabBarHeight + spacing.s8} />
    </FeedContext.Provider>
  );
}

/** Read the feed context. Throws if used outside {@link FeedProvider}. */
export function useFeed(): FeedContextValue {
  const ctx = useContext(FeedContext);
  if (!ctx) {
    throw new Error('useFeed must be used within a FeedProvider');
  }
  return ctx;
}

/** Whether the provider is running on fixtures (the pager hides pagination UI then). */
export { USE_FIXTURES, PREFETCH_THRESHOLD };
