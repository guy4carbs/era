import type { MetadataRoute } from 'next';
import { createDbClient } from '@era/db';
import { siteUrl } from '../lib/site-url';
import { listIndexableProfiles } from '../lib/public-profile-server';

/**
 * The XML sitemap, served by Next at `/sitemap.xml`. Lists the public, indexable
 * surfaces — the marketing landing, the two legal pages, and (Layer 3) every
 * public, non-thin profile. Everything behind auth (the `(tabs)` app, onboarding,
 * settings, …) is excluded here and `Disallow`ed in `robots.ts`; the two must
 * stay in agreement.
 *
 * All URLs are absolute via `siteUrl()` — Google requires fully-qualified
 * locations, and the canonical host lives in exactly one place.
 *
 * The dynamic profile block below matches EXACTLY what the page indexes: only
 * public accounts over the `PUBLIC_PROFILE_MIN_ITEMS` "thin" bar (private + thin
 * profiles render but ship `noindex`, so they must NOT appear here). The query is
 * capped and wrapped so a DB hiccup degrades to the static routes rather than
 * failing the whole sitemap.
 */

/**
 * Regenerate at most hourly (ISR). Without this, Next renders the sitemap once
 * per deploy and serves it statically — so a profile that flips to private (or
 * drops below the thin bar) would keep appearing in `/sitemap.xml` until the next
 * deploy. Hourly revalidation bounds that stale-listing window to an hour.
 */
export const revalidate = 3600;

/** Upper bound on profile entries per sitemap render — keeps the file bounded. */
const PROFILE_SITEMAP_CAP = 5000;
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

/** Public, non-thin profiles as sitemap entries. Never throws — [] on any error. */
async function publicProfileRoutes(): Promise<MetadataRoute.Sitemap> {
  try {
    const db = createDbClient(process.env.DATABASE_URL!);
    const indexable = await listIndexableProfiles(db, PROFILE_SITEMAP_CAP);
    return indexable.map((profile) => ({
      url: `${siteUrl()}/${profile.username}`,
      lastModified: profile.updatedAt,
      changeFrequency: 'weekly',
      priority: 0.6,
    }));
  } catch {
    // A DB hiccup must not fail the sitemap — ship the static routes alone.
    return [];
  }
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  return [...staticRoutes, ...(await publicProfileRoutes())];
}
