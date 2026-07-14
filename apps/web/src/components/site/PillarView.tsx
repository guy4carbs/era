import { type CSSProperties } from 'react';
import { typeRamp } from '@era/tokens';

import { Container } from '../Container';
import { JsonLd, webPageSchema, faqPageSchema, breadcrumbSchema } from '../seo';
import { FaqBlock } from './FaqBlock';
import { RelatedLinks } from './RelatedLinks';
import type { PillarContent } from '../../lib/pillars';
import { outboundLinks, type SeoPath } from '../../lib/seo-graph';

export interface PillarViewProps {
  readonly content: PillarContent;
}

/**
 * The shared render for a pillar page (`/virtual-wardrobe`, `/ai-stylist`,
 * `/outfit-planner`). The three routes are thin wrappers over this so their
 * structure — intro, sections, FAQ, Explore links, JSON-LD — can never drift.
 *
 * Structured data: WebPage + FAQPage (fed the SAME `faqs` the page renders, per
 * Google's visible-content rule) + breadcrumb. The "Explore" block realizes the
 * pillar's seo-graph edges (its cluster post, the style guide, and the archetypes
 * that fit its theme). Server Component; tokens throughout.
 */
export function PillarView({ content }: PillarViewProps) {
  const path = `/${content.slug}`;
  const explore = outboundLinks(path as SeoPath);

  return (
    <Container>
      <JsonLd
        data={[
          webPageSchema({ name: content.metaTitle, description: content.metaDescription, path }),
          faqPageSchema(content.faqs),
          breadcrumbSchema([
            { name: 'Home', url: '/' },
            { name: content.title, url: path },
          ]),
        ]}
      />
      <main style={mainStyle}>
        <header style={headerStyle}>
          <h1 style={titleStyle}>{content.title}</h1>
          {content.intro.map((paragraph, index) => (
            <p key={index} style={introStyle}>
              {paragraph}
            </p>
          ))}
        </header>

        {content.sections.map((section) => (
          <section key={section.heading} style={sectionStyle}>
            <h2 style={sectionHeadingStyle}>{section.heading}</h2>
            {section.paragraphs.map((paragraph, index) => (
              <p key={index} style={bodyStyle}>
                {paragraph}
              </p>
            ))}
          </section>
        ))}

        <FaqBlock faqs={content.faqs} />

        <RelatedLinks label="Explore" links={explore} />
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
  gap: 'var(--space-8)',
};

const headerStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-4)',
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

const introStyle: CSSProperties = {
  margin: 0,
  fontSize: typeRamp.title3.rem,
  lineHeight: `${typeRamp.title3.lineHeight}px`,
  color: 'var(--color-secondary-strong)',
};

const sectionStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-3)',
};

const sectionHeadingStyle: CSSProperties = {
  margin: 0,
  fontSize: typeRamp.title2.rem,
  lineHeight: `${typeRamp.title2.lineHeight}px`,
  fontWeight: 700,
  letterSpacing: '-0.01em',
  color: 'var(--color-text)',
};

const bodyStyle: CSSProperties = {
  margin: 0,
  fontSize: typeRamp.body.rem,
  lineHeight: `${typeRamp.body.lineHeight}px`,
  color: 'var(--color-secondary-strong)',
};
