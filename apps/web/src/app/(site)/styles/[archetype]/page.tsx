import { type CSSProperties, type JSX } from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ARCHETYPES } from '@era/core/quiz';
import { typeRamp } from '@era/tokens';

import { Container } from '../../../../components';
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
          <h1 style={titleStyle}>{def.name}</h1>
          <p style={keywordStyle}>{def.keywords.join(' · ')}</p>
          <PaletteSwatches hexes={palette} showLabels label={`${def.name} palette`} />
          <p style={paletteNarrativeStyle}>{content.paletteNarrative}</p>
        </header>

        <section style={sectionStyle}>
          {content.intro.map((paragraph, index) => (
            <p key={index} style={introStyle}>
              {paragraph}
            </p>
          ))}
        </section>

        <section style={sectionStyle}>
          <h2 style={sectionHeadingStyle}>Outfit formulas</h2>
          <ul style={formulaListStyle}>
            {content.outfitFormulas.map((formula) => (
              <li key={formula.name} style={formulaItemStyle}>
                <h3 style={formulaNameStyle}>{formula.name}</h3>
                <p style={formulaItemsStyle}>{formula.items.join(' + ')}</p>
                <p style={formulaNoteStyle}>{formula.note}</p>
              </li>
            ))}
          </ul>
        </section>

        <section style={sectionStyle}>
          <h2 style={sectionHeadingStyle}>What’s missing</h2>
          <p style={bodyStyle}>{content.gapGuide.intro}</p>
          <ul style={gapListStyle}>
            {content.gapGuide.gaps.map((gap) => (
              <li key={gap.piece} style={gapItemStyle}>
                <span style={gapPieceStyle}>{gap.piece}</span>
                <span style={gapWhyStyle}>{gap.why}</span>
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

const titleStyle: CSSProperties = {
  margin: 0,
  fontFamily: 'var(--font-era-serif), Georgia, serif',
  fontWeight: 500,
  fontSize: `clamp(${typeRamp.title1.rem}, 5vw, ${typeRamp.largeTitle.rem})`,
  lineHeight: 1.1,
  letterSpacing: '-0.01em',
  color: 'var(--color-text)',
};

const keywordStyle: CSSProperties = {
  margin: 0,
  fontSize: typeRamp.subhead.rem,
  lineHeight: `${typeRamp.subhead.lineHeight}px`,
  color: 'var(--color-secondary)',
};

const paletteNarrativeStyle: CSSProperties = {
  margin: 0,
  fontSize: typeRamp.body.rem,
  lineHeight: `${typeRamp.body.lineHeight}px`,
  color: 'var(--color-secondary-strong)',
};

const sectionStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-3)',
};

const introStyle: CSSProperties = {
  margin: 0,
  fontSize: typeRamp.title3.rem,
  lineHeight: `${typeRamp.title3.lineHeight}px`,
  color: 'var(--color-secondary-strong)',
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
  fontSize: typeRamp.title3.rem,
  lineHeight: `${typeRamp.title3.lineHeight}px`,
  fontWeight: 700,
  color: 'var(--color-text)',
};

const formulaItemsStyle: CSSProperties = {
  margin: 0,
  fontSize: typeRamp.body.rem,
  lineHeight: `${typeRamp.body.lineHeight}px`,
  color: 'var(--color-text)',
};

const formulaNoteStyle: CSSProperties = {
  margin: 0,
  fontSize: typeRamp.footnote.rem,
  lineHeight: `${typeRamp.footnote.lineHeight}px`,
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
  fontSize: typeRamp.body.rem,
  lineHeight: `${typeRamp.body.lineHeight}px`,
  fontWeight: 600,
  color: 'var(--color-text)',
};

const gapWhyStyle: CSSProperties = {
  fontSize: typeRamp.subhead.rem,
  lineHeight: `${typeRamp.subhead.lineHeight}px`,
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
