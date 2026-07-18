import { type CSSProperties } from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { ARCHETYPE_ORDER, ARCHETYPES } from '@era/core/quiz';
import { typeRamp } from '@era/tokens';

import { Container, Text } from '../../../components';
import { PaletteSwatches, RelatedLinks } from '../../../components/site';
import { JsonLd, itemListSchema, breadcrumbSchema } from '../../../components/seo';
import { archetypeToSlug } from '../../../lib/style-pages';
import { outboundLinks } from '../../../lib/seo-graph';

/**
 * `/styles` — the style-guide hub. One card per archetype (name, keyword line,
 * palette strip) linking to its page. Palette hexes come straight from
 * `ARCHETYPES` (`@era/core/quiz`) — never duplicated. Static; no env, no DB.
 *
 * Structured data: an ItemList of the eight archetype pages + a breadcrumb. The
 * cards realize the hub's seo-graph edges to the archetypes; the "Explore" block
 * carries the remaining edge (its pillar).
 */

const DESCRIPTION =
  'Explore the eight Era style archetypes — from quiet luxe to streetwear — each with its palette, outfit formulas, and wardrobe guide.';

export const metadata: Metadata = {
  title: 'Style Guide',
  description: DESCRIPTION,
  alternates: { canonical: '/styles' },
  openGraph: {
    type: 'website',
    url: '/styles',
    siteName: 'Era',
    title: 'Style Guide · Era',
    description: DESCRIPTION,
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Style Guide · Era',
    description: DESCRIPTION,
  },
};

export default function StylesHubPage() {
  const archetypes = ARCHETYPE_ORDER.map((id) => ({
    id,
    slug: archetypeToSlug(id),
    def: ARCHETYPES[id],
  }));
  // The hub's non-archetype graph edges (its pillar) — the cards cover the rest.
  const explore = outboundLinks('/styles').filter((link) => !link.path.startsWith('/styles/'));

  return (
    <Container>
      <JsonLd
        data={[
          itemListSchema({
            name: 'Era style archetypes',
            items: archetypes.map(({ slug, def }) => ({ path: `/styles/${slug}`, name: def.name })),
          }),
          breadcrumbSchema([
            { name: 'Home', url: '/' },
            { name: 'Style Guide', url: '/styles' },
          ]),
        ]}
      />
      <main style={mainStyle}>
        <header style={headerStyle}>
          <Text variant="largeTitle" as="h1" style={titleStyle}>
            Style Guide
          </Text>
          <Text variant="body" as="p" style={introStyle}>
            {DESCRIPTION}
          </Text>
        </header>

        <ul style={gridStyle}>
          {archetypes.map(({ id, slug, def }) => (
            <li key={id} style={cardItemStyle}>
              <Link href={`/styles/${slug}`} style={cardLinkStyle}>
                <Text variant="title" as="h2" size="title3" style={cardTitleStyle}>
                  {def.name}
                </Text>
                <Text variant="caption" as="p" size="footnote" style={keywordStyle}>
                  {def.keywords.join(' · ')}
                </Text>
                <PaletteSwatches hexes={def.anchorHexes} size={28} label={`${def.name} palette`} />
              </Link>
            </li>
          ))}
        </ul>

        <RelatedLinks label="Explore" links={explore} />
      </main>
    </Container>
  );
}

const mainStyle: CSSProperties = {
  paddingBlock: 'var(--space-16)',
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-12)',
};

const headerStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-3)',
  maxWidth: '65ch',
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
  maxWidth: '54ch',
  color: 'var(--color-secondary-strong)',
};

const gridStyle: CSSProperties = {
  margin: 0,
  padding: 0,
  listStyle: 'none',
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
  gap: 'var(--space-4)',
};

const cardItemStyle: CSSProperties = {
  margin: 0,
};

const cardLinkStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-3)',
  height: '100%',
  padding: 'var(--space-6)',
  borderRadius: 'var(--radius-card)',
  border: '1px solid var(--color-hairline)',
  background: 'var(--color-surface)',
  textDecoration: 'none',
};

const cardTitleStyle: CSSProperties = {
  margin: 0,
  color: 'var(--color-text)',
};

const keywordStyle: CSSProperties = {
  margin: 0,
  color: 'var(--color-secondary)',
};
