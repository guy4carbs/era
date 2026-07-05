import type { MetadataRoute } from 'next';
import { siteUrl } from '../lib/site-url';

/**
 * The XML sitemap, served by Next at `/sitemap.xml`. Lists only the public,
 * indexable surfaces — the marketing landing and the two legal pages. Everything
 * behind auth (the `(tabs)` app, onboarding, settings, …) is excluded here and
 * `Disallow`ed in `robots.ts`; the two must stay in agreement.
 *
 * All URLs are absolute via `siteUrl()` — Google requires fully-qualified
 * locations, and the canonical host lives in exactly one place.
 *
 * Layer-2/3 growth (the journal, `/styles/{archetype}` pages, and public
 * profiles) plugs in below: add static routes to `staticRoutes`, and add a
 * second block that maps dynamic content (e.g. published journal slugs, public
 * usernames) to entries — likely `async` + a DB read once those surfaces exist.
 */
const staticRoutes: MetadataRoute.Sitemap = [
  {
    url: `${siteUrl()}/`,
    lastModified: new Date(),
    changeFrequency: 'weekly',
    priority: 1,
  },
  {
    url: `${siteUrl()}/privacy`,
    lastModified: new Date(),
    changeFrequency: 'yearly',
    priority: 0.3,
  },
  {
    url: `${siteUrl()}/terms`,
    lastModified: new Date(),
    changeFrequency: 'yearly',
    priority: 0.3,
  },
];

export default function sitemap(): MetadataRoute.Sitemap {
  // Layer 2/3: spread dynamic entries here, e.g.
  //   ...(await journalRoutes()), ...(await publicProfileRoutes())
  return [...staticRoutes];
}
