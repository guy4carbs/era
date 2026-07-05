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
