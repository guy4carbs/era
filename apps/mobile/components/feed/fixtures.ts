/**
 * Feed fixtures — 30 deterministic posts so the pager is FPS-testable before the
 * server route exists (the sequencing checkpoint: prove the pager tech on real
 * data BEFORE building the chrome/sheets). {@link FeedProvider}'s `USE_FIXTURES`
 * switch feeds these instead of `fetchFeed`, so a preview build can profile
 * swiping with no backend.
 *
 * The covers use a stable seeded image host (portrait 4:5, matching the real
 * cover ratio) so a warm-cache swipe actually exercises image decode + memory —
 * the thing the 60fps test measures. A handful are deliberately `null` so the
 * placeholder path (surface colour + fade) is on screen during the same run.
 * Ids/usernames/counts are fixed, so a screenshot diff or a repeat run is stable.
 */
import type { FeedPostPayload, FeedPostType } from '@era/core/feed';

/** How many fixture posts the pager mounts under `USE_FIXTURES`. */
const FIXTURE_COUNT = 30;

/** A portrait (4:5) seeded cover so repeated loads hit the same cached bytes. */
function seededCover(seed: number): string {
  return `https://picsum.photos/seed/era-feed-${seed}/800/1000`;
}

const DISPLAY_NAMES = [
  'Mara Vance',
  null,
  'Iris Okafor',
  'June',
  null,
  'Priya Nair',
  'Sasha Lund',
  null,
] as const;

const TITLES = [
  'Quiet Monday',
  'Rainy-day layers',
  null,
  'Golden hour',
  'Off-duty tailoring',
  null,
  'Weekend in wool',
  'Soft neutrals',
] as const;

/** Build one deterministic post. Every field is a pure function of `i`. */
function makePost(i: number): FeedPostPayload {
  // Every 7th post is an era; the rest are outfits. Every 5th has no cover.
  const type: FeedPostType = i % 7 === 0 ? 'era' : 'outfit';
  const hasCover = i % 5 !== 0;
  return {
    id: `fixture-${String(i).padStart(2, '0')}`,
    type,
    coverUrl: hasCover ? seededCover(i) : null,
    title: TITLES[i % TITLES.length] ?? null,
    creator: {
      username: `stylist_${(i % 8) + 1}`,
      displayName: DISPLAY_NAMES[i % DISPLAY_NAMES.length] ?? null,
      avatarUrl: i % 3 === 0 ? seededCover(100 + i) : null,
    },
    likeCount: (i * 7) % 240,
    saveCount: (i * 3) % 90,
    viewer: {
      liked: i % 4 === 0,
      saved: i % 6 === 0,
      following: i % 3 === 0,
    },
    // Descending timestamps so the newest-first order reads naturally.
    createdAt: new Date(Date.UTC(2026, 6, 14, 12, 0, 0) - i * 3_600_000).toISOString(),
  };
}

/** The 30 fixture posts, newest-first, id-stable across runs. */
export const FIXTURE_POSTS: readonly FeedPostPayload[] = Array.from({ length: FIXTURE_COUNT }, (_, i) =>
  makePost(i),
);
