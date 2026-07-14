import type { Metadata } from 'next';

import { virtualWardrobe } from '../content/pillars/virtual-wardrobe.ts';
import { aiStylist } from '../content/pillars/ai-stylist.ts';
import { outfitPlanner } from '../content/pillars/outfit-planner.ts';

/**
 * Pillar pages — the three broad, evergreen landing pages that anchor the SEO
 * clusters (`/virtual-wardrobe`, `/ai-stylist`, `/outfit-planner`). Each page's
 * copy lives in a typed content module under `src/content/pillars`; this module
 * owns the shared type and the registry the routes + sitemap read from.
 *
 * The content modules are the surface a content agent fills in — the shape below
 * is the contract they must satisfy.
 */

/** One FAQ entry — a plain question/answer pair (also feeds `faqPageSchema`). */
export interface FaqEntry {
  readonly q: string;
  readonly a: string;
}

/** One body section on a pillar page — a heading over one or more paragraphs. */
export interface PillarSection {
  readonly heading: string;
  readonly paragraphs: readonly string[];
}

/**
 * The full content contract for a pillar page. `intro` is the lead: its first
 * ~150 words must directly answer `headKeyword` (a content agent's job). Dates
 * are ISO strings; `dateModified` feeds the sitemap's honest `lastModified`.
 */
export interface PillarContent {
  readonly slug: 'virtual-wardrobe' | 'ai-stylist' | 'outfit-planner';
  readonly title: string;
  readonly metaTitle: string;
  readonly metaDescription: string;
  readonly headKeyword: string;
  readonly dateModified: string;
  readonly intro: readonly string[];
  readonly sections: readonly PillarSection[];
  readonly faqs: readonly FaqEntry[];
}

/** A pillar-page slug. */
export type PillarSlug = PillarContent['slug'];

/** Pillar content keyed by slug — the single registry the routes and sitemap read. */
export const PILLARS = {
  'virtual-wardrobe': virtualWardrobe,
  'ai-stylist': aiStylist,
  'outfit-planner': outfitPlanner,
} as const satisfies Record<PillarSlug, PillarContent>;

/** The pillar slugs, as a const tuple (drives `generateStaticParams`-style maps). */
export const PILLAR_SLUGS = ['virtual-wardrobe', 'ai-stylist', 'outfit-planner'] as const satisfies readonly PillarSlug[];

/** Fetch a pillar's content by slug. */
export function getPillar(slug: PillarSlug): PillarContent {
  return PILLARS[slug];
}

/**
 * Per-page metadata for a pillar page. `metaTitle` runs through the `(site)`
 * layout's `%s · Era` template; `metaDescription` and a self-canonical + OG round
 * it out. Kept here so the three thin route files can't drift in shape.
 */
export function pillarMetadata(content: PillarContent): Metadata {
  const canonical = `/${content.slug}`;
  return {
    title: content.metaTitle,
    description: content.metaDescription,
    alternates: { canonical },
    openGraph: {
      type: 'website',
      url: canonical,
      siteName: 'Era',
      title: `${content.metaTitle} · Era`,
      description: content.metaDescription,
    },
    twitter: {
      card: 'summary_large_image',
      title: `${content.metaTitle} · Era`,
      description: content.metaDescription,
    },
  };
}
