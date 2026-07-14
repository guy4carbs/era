import { type CSSProperties, type JSX } from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { typeRamp } from '@era/tokens';

import { Container } from '../../../../components';
import { RelatedLinks } from '../../../../components/site';
import { JsonLd, articleSchema, breadcrumbSchema } from '../../../../components/seo';
import { JOURNAL_SLUGS, JOURNAL_POSTS, getPost, isJournalSlug, formatPostDate } from '../../../../lib/journal';
import { outboundLinks, type SeoPath } from '../../../../lib/seo-graph';
import { siteUrl } from '../../../../lib/site-url';

/**
 * `/journal/{slug}` — one journal post. Statically generated for the three known
 * slugs; any other slug 404s. The MDX body is joined with the meta owned by
 * `journal.ts` and rendered inside the shared editorial prose wrapper (from the
 * root `mdx-components.tsx`).
 *
 * INDEXING: self-canonical, OG `type: article` with published/modified times, and
 * the per-post `opengraph-image`. Structured data is an Article node (author +
 * publisher = the Era Organization) plus a breadcrumb. The "Related" block realizes
 * this post's seo-graph edges — its two sibling posts and its pillar page.
 */

export function generateStaticParams(): { slug: string }[] {
  return JOURNAL_SLUGS.map((slug) => ({ slug }));
}

/** Absolute URL of this post's OpenGraph image (the file-based `opengraph-image`). */
function ogImageUrl(slug: string): string {
  return `${siteUrl()}/journal/${slug}/opengraph-image`;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  if (!isJournalSlug(slug)) {
    return { robots: { index: false, follow: false } };
  }
  const post = JOURNAL_POSTS[slug];
  const canonical = `/journal/${slug}`;
  return {
    title: post.title,
    description: post.description,
    alternates: { canonical },
    openGraph: {
      type: 'article',
      url: canonical,
      siteName: 'Era',
      title: `${post.title} · Era`,
      description: post.description,
      publishedTime: post.datePublished,
      modifiedTime: post.dateModified,
    },
    twitter: {
      card: 'summary_large_image',
      title: `${post.title} · Era`,
      description: post.description,
    },
  };
}

export default async function JournalPostPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<JSX.Element> {
  const { slug } = await params;
  if (!isJournalSlug(slug)) {
    notFound();
  }

  const { post, default: Content } = await getPost(slug);
  const updated = post.dateModified !== post.datePublished;
  const related = outboundLinks(`/journal/${slug}` as SeoPath);

  return (
    <Container>
      <JsonLd
        data={[
          articleSchema({
            headline: post.title,
            description: post.description,
            path: `/journal/${slug}`,
            datePublished: post.datePublished,
            dateModified: post.dateModified,
            imageUrl: ogImageUrl(slug),
          }),
          breadcrumbSchema([
            { name: 'Home', url: '/' },
            { name: 'Journal', url: '/journal' },
            { name: post.title, url: `/journal/${slug}` },
          ]),
        ]}
      />
      <main style={mainStyle}>
        <nav aria-label="Breadcrumb">
          <Link href="/journal" style={backLinkStyle}>
            ← Journal
          </Link>
        </nav>

        <header style={headerStyle}>
          <h1 style={titleStyle}>{post.title}</h1>
          <div style={bylineStyle}>
            <span>By Era</span>
            <span aria-hidden="true">·</span>
            <time dateTime={post.datePublished}>{formatPostDate(post.datePublished)}</time>
            {updated ? (
              <>
                <span aria-hidden="true">·</span>
                <span>Updated {formatPostDate(post.dateModified)}</span>
              </>
            ) : null}
          </div>
        </header>

        <Content />

        <RelatedLinks label="Related" links={related} />
      </main>
    </Container>
  );
}

const mainStyle: CSSProperties = {
  maxWidth: '65ch',
  marginInline: 'auto',
  paddingInline: 'var(--space-4)',
  paddingBlock: 'var(--space-16)',
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-6)',
};

const backLinkStyle: CSSProperties = {
  fontSize: typeRamp.footnote.rem,
  lineHeight: `${typeRamp.footnote.lineHeight}px`,
  color: 'var(--color-secondary-strong)',
  textDecoration: 'none',
};

const headerStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-3)',
};

const titleStyle: CSSProperties = {
  margin: 0,
  fontFamily: 'var(--font-era-serif), Georgia, serif',
  fontWeight: 500,
  fontSize: `clamp(${typeRamp.title1.rem}, 5vw, ${typeRamp.largeTitle.rem})`,
  lineHeight: 1.1,
  letterSpacing: '-0.01em',
  color: 'var(--color-text)',
};

const bylineStyle: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 'var(--space-2)',
  fontSize: typeRamp.footnote.rem,
  lineHeight: `${typeRamp.footnote.lineHeight}px`,
  color: 'var(--color-secondary)',
};
