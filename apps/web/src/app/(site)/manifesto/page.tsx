import { type CSSProperties } from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { typeRamp } from '@era/tokens';
import { strings } from '@era/core/strings';

import { Text, EraMark } from '../../../components';
import { OviOrb } from '../../../components/ovi';
import { ScrollReveal } from '../../../components/site';
import { JsonLd, articleSchema, breadcrumbSchema } from '../../../components/seo';
import { siteUrl } from '../../../lib/site-url';

/**
 * `/manifesto` — a pure-typography editorial page: the type IS the design. A
 * single centred measure carrying the north star (Display Fraunces), the five
 * beliefs (each a serif head + two lines of Geist, revealed on scroll), one
 * appearance of Ovi beside her own belief, and a quiet return to the waitlist.
 * A public surface like `/privacy` — no session gate. Server-rendered end to
 * end; the only client islands are the scroll reveals and the decorative orb.
 *
 * Inherits the `(site)` chrome + footer. `force-static`: nothing here is dynamic
 * (the copy is the committed `strings.site.manifesto`), so it renders at build.
 */
export const dynamic = 'force-static';

const { manifesto } = strings.site;

/**
 * Fixed publish date for the Article node. This is a publication date, not a
 * runtime value — hardcoded so the structured data is stable across builds
 * rather than drifting to "now" on every deploy.
 */
const PUBLISHED_ISO = '2026-07-22';

/** Absolute URL of the share image — the generated per-page `opengraph-image` route. */
function ogImageUrl(): string {
  return `${siteUrl()}/manifesto/opengraph-image`;
}

export const metadata: Metadata = {
  // Bare title — the (site) template renders it as "Manifesto · Era".
  title: manifesto.metaTitle,
  description: manifesto.metaDescription,
  alternates: { canonical: '/manifesto' },
  openGraph: {
    type: 'article',
    url: '/manifesto',
    siteName: 'Era',
    title: `${manifesto.metaTitle} · Era`,
    description: manifesto.metaDescription,
  },
  twitter: {
    card: 'summary_large_image',
    title: `${manifesto.metaTitle} · Era`,
    description: manifesto.metaDescription,
  },
};

export default function ManifestoPage() {
  return (
    <>
      <JsonLd
        data={[
          articleSchema({
            headline: manifesto.northStar,
            description: manifesto.metaDescription,
            path: '/manifesto',
            datePublished: PUBLISHED_ISO,
            dateModified: PUBLISHED_ISO,
            imageUrl: ogImageUrl(),
          }),
          breadcrumbSchema([
            { name: 'Home', url: '/' },
            { name: 'Manifesto', url: '/manifesto' },
          ]),
        ]}
      />
      <main style={mainStyle}>
        <header style={headerStyle}>
          {/* The locked mark, quiet above the north star. Server-rendered, so the
              per-mode ink comes from --color-mark-onbg (ink on light, cream on
              dark) — the two-ink brand's mode choice, not a recolor. */}
          <EraMark fill="var(--color-mark-onbg)" heightPx={20} />
          {/* The north star, the page's h1, in the locked Display clamp. */}
          <Text variant="display" as="h1" style={northStarStyle}>
            {manifesto.northStar}
          </Text>
        </header>

        <div style={beliefsStyle}>
          {manifesto.beliefs.map((belief, index) => {
            const ordinal = String(index + 1).padStart(2, '0');
            // Belief 02 — 'An honest stylist' — is Ovi's; she stands beside it.
            const isOvi = index === 1;
            return (
              <ScrollReveal key={belief.title} amount={0.3}>
                <section style={beliefBlockStyle}>
                  <Text variant="caption" as="p" size="subhead" style={ordinalStyle}>
                    {ordinal}
                  </Text>
                  <div style={titleRowStyle}>
                    <Text variant="largeTitle" as="h2" style={beliefTitleStyle}>
                      {belief.title}
                    </Text>
                    {isOvi ? (
                      <OviOrb size="header" state="idle" style={orbStyle} />
                    ) : null}
                  </div>
                  <Text variant="body" as="p" size="title3" style={beliefBodyStyle}>
                    {belief.body}
                  </Text>
                </section>
              </ScrollReveal>
            );
          })}
        </div>

        <footer style={pageFooterStyle}>
          <Text variant="oviAccent" as="p" style={footerLineStyle}>
            {manifesto.footerLine}
          </Text>
          <Link href="/#waitlist" style={waitlistLinkStyle}>
            <Text variant="ui" as="span" style={{ color: 'inherit' }}>
              {strings.site.hero.cta}
            </Text>
            <span aria-hidden="true">→</span>
          </Link>
        </footer>
      </main>
    </>
  );
}

/**
 * The editorial measure. `--content-max` (1200) is far wider than reading type
 * wants; 680px is the one-off manifesto column — a layout width (px is fine for
 * layout), centred, with the standard gutter so it never kisses the edge on
 * mobile.
 */
const mainStyle: CSSProperties = {
  maxWidth: '680px',
  marginInline: 'auto',
  paddingInline: 'var(--space-4)',
  paddingBlock: 'var(--space-16)',
  display: 'flex',
  flexDirection: 'column',
  // Generous rest between the north star, the beliefs, and the close — whitespace
  // is the material here.
  gap: 'var(--space-16)',
};

const headerStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-6)',
};

const northStarStyle: CSSProperties = {
  margin: 0,
  color: 'var(--color-text)',
};

const beliefsStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  // One belief ≈ one screenful beat: a generous rhythm between blocks. On desktop
  // the extra minHeight (below) carries the "screenful"; the gap keeps mobile from
  // feeling empty while still breathing.
  gap: 'var(--space-16)',
};

const beliefBlockStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-4)',
  // Each belief lands in roughly one screenful on desktop without stranding the
  // reader in emptiness on small screens.
  minHeight: '60svh',
  justifyContent: 'center',
};

// Editorial ordinal — tracked metadata, sans (a serif here sits below the 20px
// serif floor), matching the landing's section grammar.
const ordinalStyle: CSSProperties = {
  margin: 0,
  letterSpacing: '0.14em',
  color: 'var(--color-secondary-strong)',
};

// Title + orb share a baseline-ish row; the orb floats to the title's right so
// Ovi reads as standing next to her belief without breaking the type column.
const titleRowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 'var(--space-4)',
  flexWrap: 'wrap',
};

// Belief head: fluid title2→largeTitle on largeTitle's own leading ratio (derived,
// no literal) — every belief lands large without overrunning the measure.
const beliefTitleLineHeight = typeRamp.largeTitle.lineHeight / typeRamp.largeTitle.px;

const beliefTitleStyle: CSSProperties = {
  margin: 0,
  fontSize: `clamp(${typeRamp.title2.rem}, 6vw, ${typeRamp.largeTitle.rem})`,
  lineHeight: beliefTitleLineHeight,
  color: 'var(--color-text)',
};

const orbStyle: CSSProperties = {
  flex: 'none',
};

const beliefBodyStyle: CSSProperties = {
  margin: 0,
  color: 'var(--color-secondary-strong)',
  maxWidth: '46ch',
};

const pageFooterStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-6)',
  alignItems: 'flex-start',
  paddingTop: 'var(--space-8)',
  borderTop: '1px solid var(--color-hairline)',
};

// The closing line in Ovi's italic accent — the one warm, editorial beat before
// the return to the waitlist.
const footerLineStyle: CSSProperties = {
  margin: 0,
  fontSize: `clamp(${typeRamp.title3.rem}, 4vw, ${typeRamp.title1.rem})`,
  color: 'var(--color-text)',
  maxWidth: '24ch',
};

// A quiet link back to the waitlist — no loud pill; the type carries it.
const waitlistLinkStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 'var(--space-2)',
  color: 'var(--color-accent)',
  textDecoration: 'none',
};
