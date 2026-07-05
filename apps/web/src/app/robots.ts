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
 * Keep this in lockstep with `sitemap.ts`: anything indexable belongs in the
 * sitemap and must NOT be disallowed here, and vice versa.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: [
        '/feed',
        '/closet',
        '/design',
        '/shop',
        '/api/',
        '/sign-in',
        '/onboarding',
        '/quiz',
        '/settings',
        '/design-lab',
      ],
    },
    sitemap: `${siteUrl()}/sitemap.xml`,
  };
}
