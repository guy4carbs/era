import { strings } from '@era/core/strings';
import { siteUrl } from '../../lib/site-url';

/**
 * Typed schema.org builders for Era's JSON-LD. Every URL resolves through
 * {@link siteUrl} (the single canonical-origin source), and every entity
 * description reuses the locked `strings.site.seo` copy so search engines and
 * AI assistants describe Era the same way they see it on the page. The plain
 * objects returned here are handed to {@link JsonLd}, which serializes and
 * XSS-hardens them.
 */

/** Absolute URL for a site-relative path, normalized through the canonical origin. */
const abs = (path: string): string => new URL(path, siteUrl()).toString();

/** Organization node — Era the company/brand. `sameAs` is empty until socials exist. */
export function organizationSchema(): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: 'Era',
    url: siteUrl(),
    logo: abs('/icon.png'),
    description: strings.site.seo.organizationDescription,
    sameAs: [],
  };
}

/** WebSite node — the site itself, for sitelinks/brand grounding. */
export function webSiteSchema(): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: 'Era',
    url: siteUrl(),
  };
}

/**
 * WebApplication node — Era the app. Free during early access, so the offer is
 * a $0 USD {@link https://schema.org/Offer}.
 */
export function softwareApplicationSchema(): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebApplication',
    name: 'Era',
    applicationCategory: 'LifestyleApplication',
    operatingSystem: 'iOS, Web',
    description: strings.site.seo.appDescription,
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
  };
}

/** A plain question/answer pair — the shape both the landing FAQ and the Layer-2 FAQs share. */
export interface FaqSchemaEntry {
  readonly q: string;
  readonly a: string;
}

/**
 * FAQPage node from a page's FAQ. Google requires the schema's Q&A text to match
 * the visible page content, so this is always fed the SAME entries the page
 * renders — the landing's `strings.site.faq`, or a pillar/style page's `faqs`.
 */
export function faqPageSchema(entries: readonly FaqSchemaEntry[]): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: entries.map((entry) => ({
      '@type': 'Question',
      name: entry.q,
      acceptedAnswer: { '@type': 'Answer', text: entry.a },
    })),
  };
}

/** The identity + social fields a {@link profilePageSchema} node is built from. */
export interface ProfileSchemaInput {
  readonly username: string;
  readonly displayName: string | null;
  readonly avatarUrl: string | null;
  readonly followerCount: number;
  /** The profile's creation time, ISO 8601 — feeds `dateCreated`/`dateModified`. */
  readonly createdAt: string;
}

/**
 * ProfilePage node for a public profile — Google's rich-result type for a
 * person's profile page. `mainEntity` is the Person: their name, `@handle`
 * (`alternateName`), canonical profile `url`, and avatar `image` when present.
 * Follower count is expressed as a schema.org {@link https://schema.org/FollowAction}
 * `interactionStatistic` (an InteractionCounter), the sanctioned way to state a
 * follower total. `dateCreated` is the profile's creation time; `dateModified`
 * mirrors it because Era does not track profile edits yet — an honest "last known
 * change" rather than a fabricated recency. Only emitted for indexable (public,
 * non-thin) profiles.
 */
export function profilePageSchema(input: ProfileSchemaInput): Record<string, unknown> {
  const name = input.displayName?.trim() ? input.displayName.trim() : input.username;
  const followers = Number.isFinite(input.followerCount)
    ? Math.max(0, Math.trunc(input.followerCount))
    : 0;

  const person: Record<string, unknown> = {
    '@type': 'Person',
    name,
    alternateName: `@${input.username}`,
    identifier: input.username,
    url: abs(`/${input.username}`),
    interactionStatistic: {
      '@type': 'InteractionCounter',
      interactionType: 'https://schema.org/FollowAction',
      userInteractionCount: followers,
    },
  };
  if (input.avatarUrl) {
    person.image = input.avatarUrl;
  }

  return {
    '@context': 'https://schema.org',
    '@type': 'ProfilePage',
    // We don't track profile edits, so dateModified mirrors dateCreated (an honest
    // "last known change") rather than inventing a fresher timestamp.
    dateCreated: input.createdAt,
    dateModified: input.createdAt,
    mainEntity: person,
  };
}

/** BreadcrumbList node — an ordered trail of {name, url}; urls resolved to absolute. */
export function breadcrumbSchema(items: readonly { name: string; url: string }[]): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: abs(item.url),
    })),
  };
}

/** The Era publisher/author Organization sub-node (with logo) reused by article schema. */
function eraPublisher(): Record<string, unknown> {
  return {
    '@type': 'Organization',
    name: 'Era',
    url: siteUrl(),
    logo: { '@type': 'ImageObject', url: abs('/icon.png') },
  };
}

/** The fields an {@link articleSchema} node is built from. */
export interface ArticleSchemaInput {
  readonly headline: string;
  readonly description: string;
  /** Site-relative canonical path, e.g. `/journal/how-to-digitize-your-closet`. */
  readonly path: string;
  /** ISO 8601 publish + last-modified timestamps. */
  readonly datePublished: string;
  readonly dateModified: string;
  /** Absolute URL of the share image (the post's OpenGraph image). */
  readonly imageUrl: string;
}

/**
 * Article node for a journal post. Author and publisher are both the Era
 * {@link https://schema.org/Organization} (Era publishes editorially — there is
 * no per-post byline), the publisher carrying the logo Google's article rich
 * result wants. `mainEntityOfPage` pins the canonical, and `image` is the post's
 * OpenGraph card so the article and its share preview agree.
 */
export function articleSchema(input: ArticleSchemaInput): Record<string, unknown> {
  const url = abs(input.path);
  return {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: input.headline,
    description: input.description,
    datePublished: input.datePublished,
    dateModified: input.dateModified,
    image: input.imageUrl,
    author: { '@type': 'Organization', name: 'Era', url: siteUrl() },
    publisher: eraPublisher(),
    mainEntityOfPage: { '@type': 'WebPage', '@id': url },
    url,
  };
}

/** One post entry for {@link blogSchema}. */
export interface BlogPostRef {
  readonly path: string;
  readonly headline: string;
  readonly description: string;
  readonly datePublished: string;
}

/**
 * Blog node for the journal index — a {@link https://schema.org/Blog} whose
 * `blogPost` list grounds the index as a collection of articles. Each entry is a
 * lightweight BlogPosting with its own canonical URL, so crawlers see the cluster
 * structure from the hub.
 */
export function blogSchema(input: {
  readonly path: string;
  readonly name: string;
  readonly description: string;
  readonly posts: readonly BlogPostRef[];
}): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'Blog',
    '@id': abs(input.path),
    name: input.name,
    description: input.description,
    url: abs(input.path),
    blogPost: input.posts.map((post) => ({
      '@type': 'BlogPosting',
      headline: post.headline,
      description: post.description,
      datePublished: post.datePublished,
      url: abs(post.path),
      mainEntityOfPage: { '@type': 'WebPage', '@id': abs(post.path) },
    })),
  };
}

/**
 * ItemList node — an ordered list of links, used for the style-guide hub so the
 * eight archetype pages are declared as a collection. `item` is the absolute URL;
 * `name` is the descriptive anchor text.
 */
export function itemListSchema(input: {
  readonly name: string;
  readonly items: readonly { readonly path: string; readonly name: string }[];
}): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: input.name,
    itemListElement: input.items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      url: abs(item.path),
    })),
  };
}

/**
 * WebPage node — a generic page entity for the pillar pages, grounding the page's
 * name/description/canonical for search engines and AI assistants.
 */
export function webPageSchema(input: {
  readonly name: string;
  readonly description: string;
  readonly path: string;
}): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    '@id': abs(input.path),
    name: input.name,
    description: input.description,
    url: abs(input.path),
  };
}
