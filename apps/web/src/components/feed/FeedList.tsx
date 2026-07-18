'use client';

import { useCallback, useEffect, useReducer, useRef, useState, type CSSProperties } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { boxShadows, layout, motion as motionToken } from '@era/tokens';
import { strings } from '@era/core/strings';
import type { FeedPage, FeedPostPayload } from '@era/core/feed';
import { transitionFor } from '../../lib/motion';
import { useSession } from '../../lib/auth-client';
import { Text } from '../Text';
import { FeedCard } from './FeedCard';

interface FeedState {
  readonly posts: FeedPostPayload[];
  readonly nextCursor: string | null;
  readonly reachedEnd: boolean;
  readonly loading: boolean;
  readonly errored: boolean;
  readonly initialLoaded: boolean;
}

type FeedAction =
  | { type: 'load_start' }
  | { type: 'load_error' }
  | { type: 'page_loaded'; posts: readonly FeedPostPayload[]; nextCursor: string | null }
  | { type: 'set_like'; postId: string; liked: boolean; likeCount: number }
  | { type: 'set_save'; postId: string; saved: boolean; saveCount: number }
  | { type: 'set_following'; username: string; following: boolean }
  | { type: 'hide_post'; postId: string }
  | { type: 'block_creator'; username: string };

const initialState: FeedState = {
  posts: [],
  nextCursor: null,
  reachedEnd: false,
  loading: false,
  errored: false,
  initialLoaded: false,
};

/** Replace one post's viewer bits + count immutably (like/save share this shape). */
function patchViewer(
  posts: FeedPostPayload[],
  postId: string,
  patch: Partial<FeedPostPayload['viewer']>,
  counts: Partial<Pick<FeedPostPayload, 'likeCount' | 'saveCount'>>,
): FeedPostPayload[] {
  return posts.map((post) =>
    post.id === postId ? { ...post, ...counts, viewer: { ...post.viewer, ...patch } } : post,
  );
}

function reducer(state: FeedState, action: FeedAction): FeedState {
  switch (action.type) {
    case 'load_start':
      return { ...state, loading: true, errored: false };
    case 'load_error':
      return { ...state, loading: false, errored: true, initialLoaded: true };
    case 'page_loaded': {
      // Dedupe by id — a cursor overlap must never double-render a card.
      const seen = new Set(state.posts.map((p) => p.id));
      const fresh = action.posts.filter((p) => !seen.has(p.id));
      return {
        ...state,
        posts: [...state.posts, ...fresh],
        nextCursor: action.nextCursor,
        reachedEnd: action.nextCursor === null,
        loading: false,
        errored: false,
        initialLoaded: true,
      };
    }
    case 'set_like':
      return {
        ...state,
        posts: patchViewer(state.posts, action.postId, { liked: action.liked }, { likeCount: action.likeCount }),
      };
    case 'set_save':
      return {
        ...state,
        posts: patchViewer(state.posts, action.postId, { saved: action.saved }, { saveCount: action.saveCount }),
      };
    case 'set_following':
      // Follow is a per-CREATOR relationship — mirror it across all their cards.
      return {
        ...state,
        posts: state.posts.map((post) =>
          post.creator.username === action.username
            ? { ...post, viewer: { ...post.viewer, following: action.following } }
            : post,
        ),
      };
    case 'hide_post':
      return { ...state, posts: state.posts.filter((p) => p.id !== action.postId) };
    case 'block_creator':
      // Bidirectional invisibility, locally: drop every card by the blocked user.
      return { ...state, posts: state.posts.filter((p) => p.creator.username !== action.username) };
    default:
      return state;
  }
}

const TOAST_MS = motionToken.durations.maxMs * 8;

/**
 * The web social feed: a single centered column of {@link FeedCard}s over
 * `GET /api/feed`, with cursor pagination driven by an IntersectionObserver
 * sentinel (no snap mechanics — that's the mobile pager). Like, save, and follow
 * are optimistic: the tap updates the card immediately, then reconciles to the
 * server's freshly-counted value, or reverts and toasts on failure. Report hides
 * the post in place; block drops every card by that creator — both mirror the
 * server's own semantics locally so the list stays consistent without a refetch.
 *
 * Rendered only when the cosmetic `NEXT_PUBLIC_ERA_FEED_ENABLED` flag is on (the
 * caller gates it); the server 404s the feed routes when the real flag is off, so
 * this component degrades to its empty state if it somehow renders while dormant.
 */
export function FeedList() {
  const [state, dispatch] = useReducer(reducer, initialState);
  const [toast, setToast] = useState<string | null>(null);
  const reduced = useReducedMotion();
  const { data: session } = useSession();

  // Best-effort self-post guard. Better Auth's session may not carry a handle; when
  // it doesn't this reads `undefined` and the FeedCard guard safely no-ops (own
  // posts are already excluded server-side by the creator ≠ viewer filter).
  const viewerUsername = (session?.user as { username?: string } | undefined)?.username;

  // Latest state for the observer callback without re-binding the observer.
  const stateRef = useRef(state);
  stateRef.current = state;
  // Synchronous in-flight guard: dispatched `loading` only lands on the next
  // render, so the observer could double-fire before then without this.
  const inFlight = useRef(false);
  const sentinelRef = useRef<HTMLDivElement>(null);

  const loadPage = useCallback(async (cursor: string | null) => {
    if (inFlight.current) return;
    inFlight.current = true;
    dispatch({ type: 'load_start' });
    try {
      const url = cursor ? `/api/feed?cursor=${encodeURIComponent(cursor)}` : '/api/feed';
      const res = await fetch(url, { credentials: 'same-origin' });
      if (!res.ok) throw new Error(`feed ${res.status}`);
      const body = (await res.json()) as FeedPage;
      dispatch({ type: 'page_loaded', posts: body.posts, nextCursor: body.nextCursor });
    } catch {
      dispatch({ type: 'load_error' });
    } finally {
      inFlight.current = false;
    }
  }, []);

  const loadMore = useCallback(() => {
    const s = stateRef.current;
    if (s.reachedEnd || s.errored) return;
    void loadPage(s.nextCursor);
  }, [loadPage]);

  // Initial page.
  useEffect(() => {
    void loadPage(null);
  }, [loadPage]);

  // Infinite scroll: load the next page when the sentinel nears the viewport.
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) loadMore();
      },
      { rootMargin: '400px' },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [loadMore, state.reachedEnd]);

  useEffect(() => {
    if (!toast) return;
    const handle = setTimeout(() => setToast(null), TOAST_MS);
    return () => clearTimeout(handle);
  }, [toast]);

  const handleLike = useCallback((post: FeedPostPayload) => {
    const nextLiked = !post.viewer.liked;
    dispatch({
      type: 'set_like',
      postId: post.id,
      liked: nextLiked,
      likeCount: Math.max(0, post.likeCount + (nextLiked ? 1 : -1)),
    });
    void (async () => {
      try {
        const res = await fetch(`/api/posts/${post.id}/like`, {
          method: nextLiked ? 'POST' : 'DELETE',
          credentials: 'same-origin',
        });
        if (!res.ok) throw new Error(`like ${res.status}`);
        const body = (await res.json()) as { liked: boolean; likeCount: number };
        dispatch({ type: 'set_like', postId: post.id, liked: body.liked, likeCount: body.likeCount });
      } catch {
        dispatch({ type: 'set_like', postId: post.id, liked: post.viewer.liked, likeCount: post.likeCount });
        setToast(strings.errors.generic);
      }
    })();
  }, []);

  const handleSave = useCallback((post: FeedPostPayload) => {
    const nextSaved = !post.viewer.saved;
    dispatch({
      type: 'set_save',
      postId: post.id,
      saved: nextSaved,
      saveCount: Math.max(0, post.saveCount + (nextSaved ? 1 : -1)),
    });
    void (async () => {
      try {
        const res = await fetch(`/api/posts/${post.id}/save`, {
          method: nextSaved ? 'POST' : 'DELETE',
          credentials: 'same-origin',
        });
        if (!res.ok) throw new Error(`save ${res.status}`);
        const body = (await res.json()) as { saved: boolean; saveCount: number };
        dispatch({ type: 'set_save', postId: post.id, saved: body.saved, saveCount: body.saveCount });
      } catch {
        dispatch({ type: 'set_save', postId: post.id, saved: post.viewer.saved, saveCount: post.saveCount });
        setToast(strings.errors.generic);
      }
    })();
  }, []);

  const handleFollow = useCallback((post: FeedPostPayload) => {
    const nextFollowing = !post.viewer.following;
    const username = post.creator.username;
    dispatch({ type: 'set_following', username, following: nextFollowing });
    void (async () => {
      try {
        const res = await fetch('/api/follows', {
          method: nextFollowing ? 'POST' : 'DELETE',
          headers: { 'content-type': 'application/json' },
          credentials: 'same-origin',
          body: JSON.stringify({ username }),
        });
        if (!res.ok) throw new Error(`follows ${res.status}`);
        const body = (await res.json()) as { following: boolean };
        dispatch({ type: 'set_following', username, following: body.following });
      } catch {
        dispatch({ type: 'set_following', username, following: post.viewer.following });
        setToast(strings.errors.generic);
      }
    })();
  }, []);

  const handleReported = useCallback((postId: string) => {
    dispatch({ type: 'hide_post', postId });
    setToast(strings.feed.reportConfirm);
  }, []);

  const handleBlocked = useCallback((username: string) => {
    dispatch({ type: 'block_creator', username });
    setToast(strings.feed.blockedConfirm);
  }, []);

  const isEmpty = state.initialLoaded && state.posts.length === 0;

  return (
    <section style={columnStyle} aria-label="Feed">
      {state.posts.map((post) => (
        <FeedCard
          key={post.id}
          post={post}
          viewerUsername={viewerUsername}
          onLike={handleLike}
          onSave={handleSave}
          onFollow={handleFollow}
          onReported={handleReported}
          onBlocked={handleBlocked}
        />
      ))}

      {isEmpty && !state.errored ? (
        <Text variant="caption" size="footnote" as="p" style={quietLineStyle}>
          {strings.feed.empty}
        </Text>
      ) : null}

      {isEmpty && state.errored ? (
        <div style={retryWrapStyle}>
          <Text variant="caption" size="footnote" as="p" style={quietLineStyle}>
            {strings.errors.generic}
          </Text>
          <button type="button" style={retryButtonStyle} onClick={() => void loadPage(null)}>
            <Text variant="caption" size="footnote" weight={600} as="span" style={{ color: 'var(--color-accent)' }}>
              {strings.errors.retry}
            </Text>
          </button>
        </div>
      ) : null}

      {!isEmpty && state.reachedEnd ? (
        <Text variant="caption" size="footnote" as="p" style={quietLineStyle}>
          {strings.feed.feedEnd}
        </Text>
      ) : null}

      {state.loading && state.posts.length > 0 ? (
        <Text variant="caption" size="footnote" as="p" role="status" style={quietLineStyle}>
          {strings.feed.loadingMore}
        </Text>
      ) : null}

      {!state.reachedEnd ? <div ref={sentinelRef} aria-hidden="true" style={sentinelStyle} /> : null}

      <AnimatePresence>
        {toast ? (
          <motion.div
            key={toast}
            role="status"
            style={toastStyle}
            initial={{ opacity: 0, x: '-50%', y: reduced ? 0 : 8 }}
            animate={{ opacity: 1, x: '-50%', y: 0 }}
            exit={{ opacity: 0, x: '-50%', y: reduced ? 0 : 8 }}
            transition={transitionFor(motionToken.springs.gentle, reduced)}
          >
            <Text variant="caption" size="footnote" as="span">
              {toast}
            </Text>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </section>
  );
}

const columnStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-4)',
  width: '100%',
  // The feed is one centered column (`layout.feedColumnWidth` = 480), never a
  // fluid grid — below 480 it simply fills the width.
  maxWidth: layout.feedColumnWidth,
  marginInline: 'auto',
};

const quietLineStyle: CSSProperties = {
  margin: 0,
  paddingBlock: 'var(--space-6)',
  textAlign: 'center',
  color: 'var(--color-secondary)',
};

const retryWrapStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: 'var(--space-2)',
};

const retryButtonStyle: CSSProperties = {
  padding: 0,
  border: 'none',
  background: 'transparent',
  cursor: 'pointer',
};

const sentinelStyle: CSSProperties = { height: 1, width: '100%' };

const toastStyle: CSSProperties = {
  position: 'fixed',
  left: '50%',
  bottom: 'calc(var(--space-16) + env(safe-area-inset-bottom))',
  paddingInline: 'var(--space-4)',
  paddingBlock: 'var(--space-3)',
  borderRadius: 'var(--radius-input)',
  background: 'var(--color-surface)',
  border: '1px solid var(--color-hairline)',
  color: 'var(--color-text)',
  boxShadow: boxShadows.e3,
  zIndex: 70,
};
