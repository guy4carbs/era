import type { ComponentType } from 'react';

/**
 * The Journal — Era's editorial SEO cluster. This module is the SINGLE owner of
 * every post's metadata; the `.mdx` files under `src/content/journal` carry ONLY
 * the prose body. Keeping meta here (not in MDX frontmatter) means the sitemap
 * helper and the seo-graph test can read titles/dates as plain TypeScript under
 * the `node --experimental-strip-types` runner, which cannot parse MDX — and it
 * removes the drift risk of duplicating frontmatter across files.
 *
 * `getPost`/`getAllPosts` join this meta with the dynamically-imported MDX body.
 */

/** The three content pillars a journal post can belong to (a pillar-page slug). */
export type JournalPillar = 'virtual-wardrobe' | 'ai-stylist' | 'outfit-planner';

/** A journal post's metadata — everything except the MDX body. Dates are ISO strings. */
export interface JournalPost {
  readonly slug: string;
  readonly title: string;
  readonly description: string;
  /** The head keyword the post is written to answer — used for intent, not stuffed. */
  readonly headKeyword: string;
  readonly datePublished: string;
  readonly dateModified: string;
  readonly pillar: JournalPillar;
  /** Sibling post slugs shown in the post's "Related" block (descriptive anchors). */
  readonly related: readonly string[];
}

/**
 * Post metadata, keyed by slug. The `slug` field mirrors the key (so a single
 * post object is self-describing when passed around). Seeded with real,
 * honest SEO frontmatter; the MDX bodies are a content agent's job.
 */
export const JOURNAL_POSTS = {
  'how-to-digitize-your-closet': {
    slug: 'how-to-digitize-your-closet',
    title: 'How to Digitize Your Closet',
    description:
      'A simple, honest walkthrough for turning the clothes you already own into a searchable virtual wardrobe — by photo or by product link.',
    headKeyword: 'digitize your closet',
    datePublished: '2026-07-14',
    dateModified: '2026-07-14',
    pillar: 'virtual-wardrobe',
    related: ['what-an-ai-stylist-actually-does', 'plan-a-week-of-outfits'],
  },
  'what-an-ai-stylist-actually-does': {
    slug: 'what-an-ai-stylist-actually-does',
    title: 'What an AI Stylist Actually Does',
    description:
      'What an AI stylist can and cannot do — how Ovi builds outfits from the clothes you already own, and when she tells you not to buy.',
    headKeyword: 'ai stylist',
    datePublished: '2026-07-14',
    dateModified: '2026-07-14',
    pillar: 'ai-stylist',
    related: ['how-to-digitize-your-closet', 'plan-a-week-of-outfits'],
  },
  'plan-a-week-of-outfits': {
    slug: 'plan-a-week-of-outfits',
    title: 'How to Plan a Week of Outfits',
    description:
      'A calm, repeatable way to plan a week of outfits from your own closet — fewer morning decisions, more days you feel put together.',
    headKeyword: 'plan a week of outfits',
    datePublished: '2026-07-14',
    dateModified: '2026-07-14',
    pillar: 'outfit-planner',
    related: ['how-to-digitize-your-closet', 'what-an-ai-stylist-actually-does'],
  },
} as const satisfies Record<string, JournalPost>;

/**
 * The post slugs in publication order. A const tuple so consumers get exact
 * literal types and `generateStaticParams` can map it directly. This is the
 * single source of truth for which posts exist.
 */
export const JOURNAL_SLUGS = [
  'how-to-digitize-your-closet',
  'what-an-ai-stylist-actually-does',
  'plan-a-week-of-outfits',
] as const satisfies readonly (keyof typeof JOURNAL_POSTS)[];

/** A journal post's slug — one of the three known keys. */
export type JournalSlug = (typeof JOURNAL_SLUGS)[number];

/** True when an arbitrary string is a known journal slug (narrows the type). */
export function isJournalSlug(slug: string): slug is JournalSlug {
  return (JOURNAL_SLUGS as readonly string[]).includes(slug);
}

/** The MDX body component — a zero-prop React component compiled from the `.mdx`. */
export type MDXContent = ComponentType;

/** A post fully resolved: its metadata plus the compiled MDX body component. */
export interface LoadedPost {
  readonly post: JournalPost;
  /** The MDX default export (the rendered body). Named `default` to mirror the module. */
  readonly default: MDXContent;
}

/**
 * Load one post: dynamically import its MDX body and join it with the meta owned
 * here. The dynamic `import()` uses a static prefix/suffix so the bundler can
 * build the module context at build time; the body is the module's default
 * export. Throws for an unknown slug — callers gate with {@link isJournalSlug}
 * and `notFound()` before calling.
 */
export async function getPost(slug: JournalSlug): Promise<LoadedPost> {
  const mod = (await import(`../content/journal/${slug}.mdx`)) as { default: MDXContent };
  return { post: JOURNAL_POSTS[slug], default: mod.default };
}

/** All posts, metadata + body, sorted by `datePublished` descending (newest first). */
export async function getAllPosts(): Promise<LoadedPost[]> {
  const loaded = await Promise.all(JOURNAL_SLUGS.map((slug) => getPost(slug)));
  return loaded.sort((a, b) => b.post.datePublished.localeCompare(a.post.datePublished));
}

/** Post metadata only (no MDX body), newest first — for the index and link lists. */
export function getAllPostMeta(): JournalPost[] {
  return JOURNAL_SLUGS.map((slug) => JOURNAL_POSTS[slug]).sort((a, b) =>
    b.datePublished.localeCompare(a.datePublished),
  );
}

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
] as const;

/**
 * Format an ISO `YYYY-MM-DD` date as a readable label (e.g. "July 14, 2026").
 * Parsed by hand rather than via `new Date(iso)` so a build in any timezone can't
 * shift a date-only string across midnight (the classic off-by-one). Returns the
 * input unchanged if it isn't a well-formed date-only string.
 */
export function formatPostDate(iso: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) return iso;
  const [, year, month, day] = match;
  const monthName = MONTHS[Number(month) - 1];
  if (!monthName) return iso;
  return `${monthName} ${Number(day)}, ${year}`;
}
