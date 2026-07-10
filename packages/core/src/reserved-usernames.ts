/**
 * @era/core — reserved usernames.
 *
 * Public profiles are addressed by a top-level path segment (e.g. a profile at
 * `/{username}`), so a claimed username must never collide with — or shadow — a
 * real application route, a legal/SEO surface, or a routing artifact. Two callers
 * enforce this from ONE list:
 *
 *   - The username CLAIM path ({@link isReservedUsername} → reject the claim) so
 *     nobody can register `admin`, `settings`, `api`, …
 *   - The public-profile LOADER (a reserved name resolves to `not_found`) so even
 *     if a reserved row somehow existed, it is never served as a profile.
 *
 * The set is stored lowercase; {@link isReservedUsername} lowercases its input
 * before the lookup. Names that already fail username-format validation (dots,
 * hyphens, wrong length — e.g. `sitemap.xml`, `sign-in`, `u`) are still listed
 * defensively: the list documents the intent and stays correct even if the
 * format rule ever loosens.
 */

/**
 * Every path segment or word that must not be claimable as a username. Grouped
 * by why it is reserved so additions land in the right bucket.
 */
export const RESERVED_USERNAMES: ReadonlySet<string> = new Set([
  // Live top-level app routes (must stay reachable, never shadowed by a profile).
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
  'u',
  'profile',
  'admin',
  'era',
  'eras',
  // Legal / SEO / routing surfaces.
  'sitemap.xml',
  'robots.txt',
  'llms.txt',
  'privacy',
  'terms',
  'legal',
  'cookies',
  'dmca',
  'well-known',
  'favicon.ico',
  'manifest.json',
  // Auth + account aliases people would guess (and that we may add later).
  'signin',
  'signup',
  'sign-up',
  'login',
  'logout',
  'register',
  'auth',
  'account',
  'accounts',
  'me',
  'password',
  'verify',
  'oauth',
  'callback',
  // Product surfaces reachable now or clearly on the roadmap.
  'ovi',
  'wardrobe',
  'outfit',
  'outfits',
  'item',
  'items',
  'style',
  'styles',
  'waitlist',
  'explore',
  'search',
  'notifications',
  'messages',
  'followers',
  'following',
  'discover',
  // Generic web / infra reservations and dangerous literals.
  'about',
  'help',
  'support',
  'contact',
  'home',
  'app',
  'apps',
  'blog',
  'careers',
  'jobs',
  'press',
  'team',
  'status',
  'health',
  'static',
  'public',
  'assets',
  'cdn',
  'img',
  'images',
  'media',
  'download',
  'new',
  'edit',
  'delete',
  'root',
  'system',
  'null',
  'undefined',
  'true',
  'false',
]);

/**
 * True when `value` names a reserved route/word and therefore cannot be a
 * username. Comparison is case-insensitive; a non-string is never reserved.
 */
export function isReservedUsername(value: unknown): boolean {
  return typeof value === 'string' && RESERVED_USERNAMES.has(value.toLowerCase());
}
