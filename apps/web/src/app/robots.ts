import type { MetadataRoute } from 'next';
import { siteUrl } from '../lib/site-url';

/**
 * `robots.txt`, served by Next at `/robots.txt`.
 *
 * Route groups (`(site)`, `(tabs)`) do NOT appear in URLs, so the disallow list
 * enumerates the real, live paths of every non-public surface: the app tabs, the
 * auth/onboarding funnel, account settings, the design lab, and all API routes.
 * `/` (the landing) plus `/privacy` and `/terms` are indexable — they are simply
 * absent from the disallow list, which is an implicit allow.
 *
 * PREFIX ANCHORING (matters once `/{username}` public profiles ship): a bare
 * `Disallow: /closet` is a PREFIX rule — it would also block a profile at
 * `/closetqueen`, silently keeping a valid public profile out of the index. So
 * every app-route entry is anchored with `$` (end-of-path) to match the page
 * exactly, and routes that also have sub-paths get a `/`-suffixed companion to
 * cover them. `/{username}` is never itself listed, so profiles stay crawlable;
 * the reserved-username list is what stops a profile from ever occupying an app
 * route name in the first place.
 *
 * Keep this in lockstep with `sitemap.ts`: anything indexable belongs in the
 * sitemap and must NOT be disallowed here, and vice versa.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: [
        // Leaf routes — exact-match only, so they can't shadow a username prefix.
        '/feed$',
        '/shop$',
        '/quiz$',
        '/worn$',
        '/settings$',
        '/plus$',
        '/onboarding$',
        '/design-lab$',
        // Routes with sub-paths — block the page AND everything beneath it.
        '/closet$',
        '/closet/',
        '/design$',
        '/design/',
        '/sign-in$',
        '/sign-in/',
        // All API routes (the trailing slash already scopes it; `/apixyz` is safe).
        '/api/',
      ],
    },
    sitemap: `${siteUrl()}/sitemap.xml`,
  };
}
