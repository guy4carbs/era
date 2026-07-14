import type { MetadataRoute } from 'next';

import { siteUrl } from './site-url.ts';
import { JOURNAL_POSTS, JOURNAL_SLUGS } from './journal.ts';
import { PILLARS, PILLAR_SLUGS } from './pillars.ts';
import { STYLE_PAGES, STYLE_SLUGS } from './style-pages.ts';

/**
 * The Layer-2 sitemap entries — journal, pillars, and the style guide — built
 * from the content registries so `lastModified` is HONEST (each page's own
 * `dateModified`, hubs the max of their children) rather than a build-time
 * `new Date()`.
 *
 * Split into its own module (not inlined in `sitemap.ts`) for one hard reason:
 * `seo-graph.test.ts` runs under `node --experimental-strip-types`, which cannot
 * parse MDX. This helper reads dates from plain `.ts` registries only (post meta
 * lives in `journal.ts`, never in the `.mdx` bodies), so the test can import it
 * and assert every graph node is present in the sitemap. `sitemap.ts` stays thin
 * and just spreads these after its static routes.
 *
 * Priorities: pillars 0.7 (broadest evergreen intent), posts + archetype pages
 * 0.6, hubs 0.5. changeFrequency 'monthly' throughout — these are slow-moving
 * editorial pages, not the feed.
 */

/** ISO date string helper — the max (latest) of a set of `YYYY-MM-DD` strings. */
function latest(dates: readonly string[]): string {
  // Same-format ISO dates compare correctly as strings; [0] is safe (non-empty).
  return [...dates].sort((a, b) => b.localeCompare(a))[0]!;
}

/** Absolute URL for a site-relative path via the canonical origin. */
function abs(path: string): string {
  return `${siteUrl()}${path}`;
}

/**
 * Build the 16 Layer-2 entries. Ordered journal (hub → posts), pillars, styles
 * (hub → archetypes) to read sensibly in the XML; order is not significant to
 * crawlers.
 */
export function layer2SitemapEntries(): MetadataRoute.Sitemap {
  const journalDates = JOURNAL_SLUGS.map((slug) => JOURNAL_POSTS[slug].dateModified);
  const styleDates = STYLE_SLUGS.map((slug) => STYLE_PAGES[slug].dateModified);

  const journalHub: MetadataRoute.Sitemap[number] = {
    url: abs('/journal'),
    lastModified: latest(journalDates),
    changeFrequency: 'monthly',
    priority: 0.5,
  };

  const journalPosts: MetadataRoute.Sitemap = JOURNAL_SLUGS.map((slug) => ({
    url: abs(`/journal/${slug}`),
    lastModified: JOURNAL_POSTS[slug].dateModified,
    changeFrequency: 'monthly',
    priority: 0.6,
  }));

  const pillars: MetadataRoute.Sitemap = PILLAR_SLUGS.map((slug) => ({
    url: abs(`/${slug}`),
    lastModified: PILLARS[slug].dateModified,
    changeFrequency: 'monthly',
    priority: 0.7,
  }));

  const stylesHub: MetadataRoute.Sitemap[number] = {
    url: abs('/styles'),
    lastModified: latest(styleDates),
    changeFrequency: 'monthly',
    priority: 0.5,
  };

  const stylePages: MetadataRoute.Sitemap = STYLE_SLUGS.map((slug) => ({
    url: abs(`/styles/${slug}`),
    lastModified: STYLE_PAGES[slug].dateModified,
    changeFrequency: 'monthly',
    priority: 0.6,
  }));

  return [journalHub, ...journalPosts, ...pillars, stylesHub, ...stylePages];
}
