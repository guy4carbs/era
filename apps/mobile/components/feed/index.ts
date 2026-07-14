/**
 * Feed surface — the full-screen outfit-inspo pager (mobile). Public entry points
 * for the feed tab (`FeedProvider` + `FeedPager`) and the dev FPS meter. The
 * cards, sheets, rail, and api are internal to this folder.
 */
export { FeedProvider, useFeed } from './FeedProvider';
export { FeedPager } from './FeedPager';
export { FpsOverlay } from './FpsOverlay';
export { sharePost, unsharePost, type ShareSubject } from './api';
