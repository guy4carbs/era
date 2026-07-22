import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { type CSSProperties } from 'react';
import { strings } from '@era/core/strings';
import { auth } from '../../lib/auth';
import { Container } from '../../components';
import {
  Hero,
  SiteHeader,
  LandingSection,
  ClosetShowcase,
  OviShowcase,
  EraCarousel,
  Closer,
  FaqSection,
} from '../../components/site';
import {
  JsonLd,
  organizationSchema,
  webSiteSchema,
  softwareApplicationSchema,
  faqPageSchema,
} from '../../components/seo';

/**
 * Landing metadata. Title/description fall back to the (site) layout's locked
 * brand defaults (no per-page `title`, so the homepage stays exactly the
 * approved og.title with no template suffix). This export pins the homepage
 * canonical and its own OpenGraph/Twitter so shared links resolve to `/`.
 */
export const metadata: Metadata = {
  alternates: { canonical: '/' },
  openGraph: {
    type: 'website',
    url: '/',
    siteName: 'Era',
    title: strings.site.og.title,
    description: strings.site.og.description,
    // og:image is injected automatically from the generated `(site)/opengraph-image`
    // route — no manual `images` entry, so the generated card is the one source.
  },
  twitter: {
    card: 'summary_large_image',
    title: strings.site.og.title,
    description: strings.site.og.description,
    // twitter:image likewise comes from the generated opengraph-image route.
  },
};

/**
 * The Era landing at `/`. Session-gated: a signed-in visitor is redirected
 * straight to `/feed`, so this marketing surface renders only for anonymous
 * traffic (the Lighthouse-90+ path). The gate reuses the same server session
 * helper the API routes use (`auth.api.getSession`).
 *
 * Everything below is server-rendered; interactivity and motion live in small
 * client islands (Hero glow, scroll reveals, the waitlist form) so the critical
 * render stays lean.
 */

// Vertical rhythm between the scroll-driven editorial sections.
const sectionsStackStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-16)',
  paddingBlock: 'var(--space-16)',
};

// The four sections' live embeds, keyed to `strings.site.sections` by scroll
// order: 1 → the real closet cards, 2 → Ovi's streamed line, 3 → the era rail,
// 4 → a quiet copy-only editorial beat (no embed). Kept as a positional tuple so
// the page maps copy and embed together and the order is the source of truth.
const SECTION_EMBEDS = [
  <ClosetShowcase key="closet" />,
  <OviShowcase key="ovi" />,
  <EraCarousel key="era" />,
  null,
] as const;

export default async function LandingPage() {
  // Session-gate is best-effort: if the auth/DB stack is momentarily unavailable,
  // the public landing must still render — never 500 the marketing front door.
  // An unresolvable session is treated as anonymous.
  let session: Awaited<ReturnType<typeof auth.api.getSession>> = null;
  try {
    session = await auth.api.getSession({ headers: await headers() });
  } catch {
    session = null;
  }
  if (session) {
    redirect('/feed');
  }

  return (
    <main>
      {/* Structured data for the marketing front door — only rendered on the
          anonymous (crawlable) branch; authed visitors are redirected above. */}
      <JsonLd
        data={[
          organizationSchema(),
          webSiteSchema(),
          softwareApplicationSchema(),
          faqPageSchema(strings.site.faq),
        ]}
      />
      <SiteHeader />
      <Hero />
      <Container>
        <div style={sectionsStackStyle}>
          {strings.site.sections.map((section, index) => (
            <LandingSection
              key={section.title}
              index={index}
              title={section.title}
              body={section.body}
            >
              {SECTION_EMBEDS[index]}
            </LandingSection>
          ))}
        </div>
        <FaqSection />
        <Closer />
      </Container>
    </main>
  );
}
