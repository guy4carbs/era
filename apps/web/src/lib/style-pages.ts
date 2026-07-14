import type { Metadata } from 'next';
import { ARCHETYPE_ORDER, type Archetype } from '@era/core/quiz';

import { quietLuxe } from '../content/styles/quiet-luxe.ts';
import { minimalist } from '../content/styles/minimalist.ts';
import { classic } from '../content/styles/classic.ts';
import { streetwear } from '../content/styles/streetwear.ts';
import { romantic } from '../content/styles/romantic.ts';
import { edgy } from '../content/styles/edgy.ts';
import { eclectic } from '../content/styles/eclectic.ts';
import { athleisure } from '../content/styles/athleisure.ts';
import type { FaqEntry } from './pillars.ts';

/**
 * Style-guide pages — one per archetype (`/styles/<slug>`). The eight archetypes
 * are the ground truth in `@era/core/quiz` under SNAKE_CASE ids (`quiet_luxe`);
 * their public URLs are KEBAB-CASE (`quiet-luxe`). This module owns that
 * bidirectional mapping, the per-page content contract, and the content
 * registry the routes + sitemap read from.
 *
 * Palette hex data is NEVER duplicated into content — pages read anchor/accent
 * hexes straight from `ARCHETYPES` in `@era/core/quiz`. Content modules carry
 * only prose (intro, palette narrative, outfit formulas, gap guide, FAQ).
 */

/**
 * Archetype id → URL slug. Only `quiet_luxe` actually differs (underscore →
 * hyphen); the rest are single words. Declared explicitly (not string-munged) so
 * the mapping is auditable and typed.
 */
const ARCHETYPE_TO_SLUG = {
  quiet_luxe: 'quiet-luxe',
  minimalist: 'minimalist',
  classic: 'classic',
  streetwear: 'streetwear',
  romantic: 'romantic',
  edgy: 'edgy',
  eclectic: 'eclectic',
  athleisure: 'athleisure',
} as const satisfies Record<Archetype, string>;

/** A style-page URL slug (kebab-case). */
export type StyleSlug = (typeof ARCHETYPE_TO_SLUG)[Archetype];

/**
 * The style slugs in canonical archetype order (mirrors `ARCHETYPE_ORDER`).
 * Drives `generateStaticParams` and the sitemap. Kept as a const tuple for
 * exact literal types.
 */
export const STYLE_SLUGS = [
  'quiet-luxe',
  'minimalist',
  'classic',
  'streetwear',
  'romantic',
  'edgy',
  'eclectic',
  'athleisure',
] as const satisfies readonly StyleSlug[];

/** Slug → archetype id, the reverse of {@link ARCHETYPE_TO_SLUG}, built once. */
const SLUG_TO_ARCHETYPE = Object.fromEntries(
  ARCHETYPE_ORDER.map((archetype) => [ARCHETYPE_TO_SLUG[archetype], archetype]),
) as Record<StyleSlug, Archetype>;

/** The URL slug for an archetype id. */
export function archetypeToSlug(archetype: Archetype): StyleSlug {
  return ARCHETYPE_TO_SLUG[archetype];
}

/** The archetype id for a URL slug, or `undefined` if the slug is unknown. */
export function slugToArchetype(slug: string): Archetype | undefined {
  return SLUG_TO_ARCHETYPE[slug as StyleSlug];
}

/** True when an arbitrary string is a known style slug (narrows the type). */
export function isStyleSlug(slug: string): slug is StyleSlug {
  return (STYLE_SLUGS as readonly string[]).includes(slug);
}

/** One outfit formula — a named recipe of pieces with a one-line styling note. */
export interface OutfitFormula {
  readonly name: string;
  readonly items: readonly string[];
  readonly note: string;
}

/** The wardrobe-gap guide — an intro plus the pieces that most often complete the look. */
export interface GapGuide {
  readonly intro: string;
  readonly gaps: readonly { readonly piece: string; readonly why: string }[];
}

/**
 * The full content contract for a style page. `archetype` ties the page back to
 * `ARCHETYPES` (name, keywords, palette hexes live there — never copied here).
 * `outfitFormulas` is exactly five. Dates are ISO; `dateModified` feeds the
 * sitemap. All prose fields are a content agent's to write.
 */
export interface StylePageContent {
  readonly archetype: Archetype;
  readonly metaTitle: string;
  readonly metaDescription: string;
  readonly dateModified: string;
  readonly intro: readonly string[];
  readonly paletteNarrative: string;
  /** Exactly five outfit formulas — the heart of the page. */
  readonly outfitFormulas: readonly [
    OutfitFormula,
    OutfitFormula,
    OutfitFormula,
    OutfitFormula,
    OutfitFormula,
  ];
  readonly gapGuide: GapGuide;
  readonly faqs: readonly FaqEntry[];
}

/** Style content keyed by URL slug — the single registry routes + sitemap read. */
export const STYLE_PAGES = {
  'quiet-luxe': quietLuxe,
  minimalist,
  classic,
  streetwear,
  romantic,
  edgy,
  eclectic,
  athleisure,
} as const satisfies Record<StyleSlug, StylePageContent>;

/** Fetch a style page's content by slug. */
export function getStylePage(slug: StyleSlug): StylePageContent {
  return STYLE_PAGES[slug];
}

/**
 * Per-page metadata for a style page. `metaTitle` runs through the `(site)`
 * layout's `%s · Era` template; a self-canonical (built from the archetype's own
 * slug) + OG round it out.
 */
export function styleMetadata(content: StylePageContent): Metadata {
  const canonical = `/styles/${archetypeToSlug(content.archetype)}`;
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
