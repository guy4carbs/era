import { type CSSProperties } from 'react';
import { typeRamp } from '@era/tokens';

import { Container } from '../Container';
import { Text } from '../Text';
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
          <Text variant="largeTitle" as="h1" style={titleStyle}>
            {content.title}
          </Text>
          {content.intro.map((paragraph, index) => (
            <Text variant="body" as="p" size="title3" key={index} style={introStyle}>
              {paragraph}
            </Text>
          ))}
        </header>

        {content.sections.map((section) => (
          <section key={section.heading} style={sectionStyle}>
            <Text variant="title" as="h2" style={sectionHeadingStyle}>
              {section.heading}
            </Text>
            {section.paragraphs.map((paragraph, index) => (
              <Text variant="body" as="p" key={index} style={bodyStyle}>
                {paragraph}
              </Text>
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

// Fluid head spanning title1→largeTitle; `largeTitle` supplies the serif face.
const titleStyle: CSSProperties = {
  margin: 0,
  fontSize: `clamp(${typeRamp.title1.rem}, 5vw, ${typeRamp.largeTitle.rem})`,
  lineHeight: 1.1,
  color: 'var(--color-text)',
};

const introStyle: CSSProperties = {
  margin: 0,
  color: 'var(--color-secondary-strong)',
};

const sectionStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-3)',
};

const sectionHeadingStyle: CSSProperties = {
  margin: 0,
  color: 'var(--color-text)',
};

const bodyStyle: CSSProperties = {
  margin: 0,
  color: 'var(--color-secondary-strong)',
};
