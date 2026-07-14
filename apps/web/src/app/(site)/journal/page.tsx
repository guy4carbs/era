import { type CSSProperties } from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { typeRamp } from '@era/tokens';

import { Container } from '../../../components';
import { JsonLd, blogSchema, breadcrumbSchema } from '../../../components/seo';
import { getAllPostMeta, formatPostDate } from '../../../lib/journal';

/**
 * `/journal` — the editorial index. Lists every journal post (title, description,
 * date) and links to it. Static: post metadata comes from the `journal.ts`
 * registry, so this renders at build with no data source. Own canonical/OG.
 *
 * Structured data: a Blog node (the index as a collection of articles) plus a
 * breadcrumb. The internal links out to each post are what feed the SEO cluster.
 */

const DESCRIPTION =
  'Practical guides on building a virtual wardrobe, styling with AI, and planning outfits from the closet you already own.';

export const metadata: Metadata = {
  title: 'Journal',
  description: DESCRIPTION,
  alternates: { canonical: '/journal' },
  openGraph: {
    type: 'website',
    url: '/journal',
    siteName: 'Era',
    title: 'Journal · Era',
    description: DESCRIPTION,
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Journal · Era',
    description: DESCRIPTION,
  },
};

export default function JournalIndexPage() {
  const posts = getAllPostMeta();
  return (
    <Container>
      <JsonLd
        data={[
          blogSchema({
            path: '/journal',
            name: 'Era Journal',
            description: DESCRIPTION,
            posts: posts.map((post) => ({
              path: `/journal/${post.slug}`,
              headline: post.title,
              description: post.description,
              datePublished: post.datePublished,
            })),
          }),
          breadcrumbSchema([
            { name: 'Home', url: '/' },
            { name: 'Journal', url: '/journal' },
          ]),
        ]}
      />
      <main style={mainStyle}>
        <header style={headerStyle}>
          <h1 style={pageTitleStyle}>Journal</h1>
          <p style={introStyle}>{DESCRIPTION}</p>
        </header>
        <ul style={listStyle}>
          {posts.map((post) => (
            <li key={post.slug} style={itemStyle}>
              <article style={cardStyle}>
                <time dateTime={post.datePublished} style={dateStyle}>
                  {formatPostDate(post.datePublished)}
                </time>
                <h2 style={postTitleStyle}>
                  <Link href={`/journal/${post.slug}`} style={postLinkStyle}>
                    {post.title}
                  </Link>
                </h2>
                <p style={postDescriptionStyle}>{post.description}</p>
              </article>
            </li>
          ))}
        </ul>
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
  gap: 'var(--space-12)',
};

const headerStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-3)',
};

const pageTitleStyle: CSSProperties = {
  margin: 0,
  fontFamily: 'var(--font-era-serif), Georgia, serif',
  fontWeight: 500,
  fontSize: `clamp(${typeRamp.title1.rem}, 5vw, ${typeRamp.largeTitle.rem})`,
  lineHeight: 1.1,
  letterSpacing: '-0.01em',
  color: 'var(--color-text)',
};

const introStyle: CSSProperties = {
  margin: 0,
  maxWidth: '54ch',
  fontSize: typeRamp.body.rem,
  lineHeight: `${typeRamp.body.lineHeight}px`,
  color: 'var(--color-secondary-strong)',
};

const listStyle: CSSProperties = {
  margin: 0,
  padding: 0,
  listStyle: 'none',
  display: 'flex',
  flexDirection: 'column',
};

const itemStyle: CSSProperties = {
  margin: 0,
};

const cardStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-2)',
  paddingBlock: 'var(--space-8)',
  borderTop: '1px solid var(--color-hairline)',
};

const dateStyle: CSSProperties = {
  fontSize: typeRamp.footnote.rem,
  lineHeight: `${typeRamp.footnote.lineHeight}px`,
  letterSpacing: '0.02em',
  color: 'var(--color-secondary)',
};

const postTitleStyle: CSSProperties = {
  margin: 0,
  fontFamily: 'var(--font-era-serif), Georgia, serif',
  fontWeight: 500,
  fontSize: typeRamp.title2.rem,
  lineHeight: `${typeRamp.title2.lineHeight}px`,
  letterSpacing: '-0.01em',
};

const postLinkStyle: CSSProperties = {
  color: 'var(--color-text)',
  textDecoration: 'none',
};

const postDescriptionStyle: CSSProperties = {
  margin: 0,
  maxWidth: '54ch',
  fontSize: typeRamp.body.rem,
  lineHeight: `${typeRamp.body.lineHeight}px`,
  color: 'var(--color-secondary-strong)',
};
