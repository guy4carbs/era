import { strings, type SiteFaqEntry } from '@era/core/strings';
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

/**
 * FAQPage node from the landing FAQ. Google requires the schema's Q&A text to
 * match visible page content, so this is fed the same `strings.site.faq` the
 * {@link FaqSection} renders.
 */
export function faqPageSchema(entries: readonly SiteFaqEntry[]): Record<string, unknown> {
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
}

/**
 * ProfilePage node for a public profile — Google's rich-result type for a
 * person's profile page. `mainEntity` is the Person: their name, `@handle`
 * (`alternateName`), canonical profile `url`, and avatar `image` when present.
 * Follower count is expressed as a schema.org {@link https://schema.org/FollowAction}
 * `interactionStatistic` (an InteractionCounter), the sanctioned way to state a
 * follower total. `dateCreated`/`dateModified` are intentionally omitted — the
 * public read model does not expose the profile's creation time (see the report's
 * note to forge-profiles); they are recommended, not required, so the node stays
 * valid without them. Only emitted for indexable (public, non-thin) profiles.
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
