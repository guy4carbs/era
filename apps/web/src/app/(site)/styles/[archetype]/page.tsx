import { type CSSProperties, type JSX } from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ARCHETYPES } from '@era/core/quiz';
import { typeRamp } from '@era/tokens';

import { Container, Text } from '../../../../components';
import { PaletteSwatches, FaqBlock, RelatedLinks } from '../../../../components/site';
import { JsonLd, faqPageSchema, breadcrumbSchema } from '../../../../components/seo';
import {
  STYLE_SLUGS,
  getStylePage,
  styleMetadata,
  isStyleSlug,
  slugToArchetype,
} from '../../../../lib/style-pages';
import { outboundLinks, type SeoPath } from '../../../../lib/seo-graph';

/**
 * `/styles/{archetype}` — one style-archetype guide. Statically generated for the
 * eight kebab-case slugs; any other slug 404s. Name, keywords, and palette hexes
 * come from `ARCHETYPES` (`@era/core/quiz`); all prose comes from the typed
 * content module. Static content — no env, no DB.
 *
 * Structured data: FAQPage (fed the SAME faqs the page renders) + breadcrumb. The
 * "Related" block realizes the page's seo-graph edges (two sibling archetypes, the
 * style-guide hub, and one pillar); the quiz CTA links the landing (not `/quiz`,
 * which is behind auth and Disallowed).
 */

export function generateStaticParams(): { archetype: string }[] {
  return STYLE_SLUGS.map((slug) => ({ archetype: slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ archetype: string }>;
}): Promise<Metadata> {
  const { archetype } = await params;
  if (!isStyleSlug(archetype)) {
    return { robots: { index: false, follow: false } };
  }
  return styleMetadata(getStylePage(archetype));
}

export default async function StylePage({
  params,
}: {
  params: Promise<{ archetype: string }>;
}): Promise<JSX.Element> {
  const { archetype } = await params;
  if (!isStyleSlug(archetype)) {
    notFound();
  }

  const content = getStylePage(archetype);
  const id = slugToArchetype(archetype);
  // `isStyleSlug` guarantees a mapping, but narrow for the type system.
  if (!id) {
    notFound();
  }
  const def = ARCHETYPES[id];
  const palette = [...def.anchorHexes, ...def.accentHexes];
  const related = outboundLinks(`/styles/${archetype}` as SeoPath);

  return (
    <Container>
      <JsonLd
        data={[
          faqPageSchema(content.faqs),
          breadcrumbSchema([
            { name: 'Home', url: '/' },
            { name: 'Style Guide', url: '/styles' },
            { name: def.name, url: `/styles/${archetype}` },
          ]),
        ]}
      />
      <main style={mainStyle}>
        <nav aria-label="Breadcrumb">
          <Link href="/styles" style={backLinkStyle}>
            ← Style Guide
          </Link>
        </nav>

        <header style={headerStyle}>
          <Text variant="largeTitle" as="h1" style={titleStyle}>
            {def.name}
          </Text>
          <Text variant="caption" as="p" size="subhead" style={keywordStyle}>
            {def.keywords.join(' · ')}
          </Text>
          <PaletteSwatches hexes={palette} showLabels label={`${def.name} palette`} />
          <Text variant="body" as="p" style={paletteNarrativeStyle}>
            {content.paletteNarrative}
          </Text>
        </header>

        <section style={sectionStyle}>
          {content.intro.map((paragraph, index) => (
            <Text variant="body" as="p" size="title3" key={index} style={introStyle}>
              {paragraph}
            </Text>
          ))}
        </section>

        <section style={sectionStyle}>
          <Text variant="title" as="h2" style={sectionHeadingStyle}>
            Outfit formulas
          </Text>
          <ul style={formulaListStyle}>
            {content.outfitFormulas.map((formula) => (
              <li key={formula.name} style={formulaItemStyle}>
                <Text variant="title" as="h3" size="title3" style={formulaNameStyle}>
                  {formula.name}
                </Text>
                <Text variant="body" as="p" style={formulaItemsStyle}>
                  {formula.items.join(' + ')}
                </Text>
                <Text variant="caption" as="p" size="footnote" style={formulaNoteStyle}>
                  {formula.note}
                </Text>
              </li>
            ))}
          </ul>
        </section>

        <section style={sectionStyle}>
          <Text variant="title" as="h2" style={sectionHeadingStyle}>
            What’s missing
          </Text>
          <Text variant="body" as="p" style={bodyStyle}>
            {content.gapGuide.intro}
          </Text>
          <ul style={gapListStyle}>
            {content.gapGuide.gaps.map((gap) => (
              <li key={gap.piece} style={gapItemStyle}>
                <Text variant="body" as="span" weight={600} style={gapPieceStyle}>
                  {gap.piece}
                </Text>
                <Text variant="caption" as="span" size="subhead" style={gapWhyStyle}>
                  {gap.why}
                </Text>
              </li>
            ))}
          </ul>
        </section>

        <FaqBlock faqs={content.faqs} />

        <RelatedLinks label="Related" links={related} />

        <section style={ctaStyle}>
          <Link href="/" style={ctaLinkStyle}>
            Take the style quiz in Era
          </Link>
        </section>
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

const backLinkStyle: CSSProperties = {
  fontSize: typeRamp.footnote.rem,
  lineHeight: `${typeRamp.footnote.lineHeight}px`,
  color: 'var(--color-secondary-strong)',
  textDecoration: 'none',
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

const keywordStyle: CSSProperties = {
  margin: 0,
  color: 'var(--color-secondary)',
};

const paletteNarrativeStyle: CSSProperties = {
  margin: 0,
  color: 'var(--color-secondary-strong)',
};

const sectionStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-3)',
};

const introStyle: CSSProperties = {
  margin: 0,
  color: 'var(--color-secondary-strong)',
};

const sectionHeadingStyle: CSSProperties = {
  margin: 0,
  color: 'var(--color-text)',
};

const bodyStyle: CSSProperties = {
  margin: 0,
  color: 'var(--color-secondary-strong)',
};

const formulaListStyle: CSSProperties = {
  margin: 0,
  padding: 0,
  listStyle: 'none',
  display: 'flex',
  flexDirection: 'column',
};

const formulaItemStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-1)',
  paddingBlock: 'var(--space-4)',
  borderTop: '1px solid var(--color-hairline)',
};

const formulaNameStyle: CSSProperties = {
  margin: 0,
  color: 'var(--color-text)',
};

const formulaItemsStyle: CSSProperties = {
  margin: 0,
  color: 'var(--color-text)',
};

const formulaNoteStyle: CSSProperties = {
  margin: 0,
  color: 'var(--color-secondary)',
};

const gapListStyle: CSSProperties = {
  margin: 0,
  padding: 0,
  listStyle: 'none',
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-3)',
};

const gapItemStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-1)',
};

const gapPieceStyle: CSSProperties = {
  color: 'var(--color-text)',
};

const gapWhyStyle: CSSProperties = {
  color: 'var(--color-secondary-strong)',
};

const ctaStyle: CSSProperties = {
  paddingBlock: 'var(--space-8)',
  borderTop: '1px solid var(--color-hairline)',
};

const ctaLinkStyle: CSSProperties = {
  fontSize: typeRamp.body.rem,
  lineHeight: `${typeRamp.body.lineHeight}px`,
  fontWeight: 600,
  color: 'var(--color-accent)',
  textDecoration: 'none',
};
