import type { CSSProperties, ReactNode } from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { typeRamp } from '@era/tokens';
import { Text } from '../../components/Text';
import { strings } from '@era/core/strings';
import { Pageview } from '../../components/site';
import { siteUrl } from '../../lib/site-url';
import { FOOTER_LINKS } from '../../lib/seo-graph';

/**
 * Public marketing chrome for the `(site)` route group — the pre-launch landing
 * and waitlist. No TabBar, no auth shell: this layer only carries brand
 * metadata and a dormant pageview beacon. The shared `<html>`/`<body>`,
 * ThemeProvider, and the Fraunces/Geist type system (`--font-era-serif` /
 * `--font-era-sans`) all come from the root layout — this group inherits them.
 */

export const metadata: Metadata = {
  // Absolute base for Open Graph / Twitter asset URLs and per-page canonicals.
  // The canonical host comes from `siteUrl()` (single source of truth) — reads
  // `NEXT_PUBLIC_SITE_URL`, falls back to localhost in dev.
  metadataBase: new URL(siteUrl()),
  // Brand default + per-page template. A page that sets its own `title` renders
  // as "<title> · Era" (keyword-leading, ≤60 chars); pages that don't fall back
  // to the locked brand default. The default is NOT run through the template, so
  // the homepage title stays exactly the approved og.title.
  title: { default: strings.site.og.title, template: '%s · Era' },
  description: strings.site.meta.description,
  // Default canonical — the homepage. Per-page metadata overrides this.
  alternates: { canonical: '/' },
  // Google Search Console ownership tag. No-ops until `NEXT_PUBLIC_GSC_VERIFICATION`
  // is set (Next omits the meta tag when undefined); the user pastes their token
  // on Railway when verifying era.style.
  verification: { google: process.env.NEXT_PUBLIC_GSC_VERIFICATION },
  openGraph: {
    type: 'website',
    url: '/',
    siteName: 'Era',
    title: strings.site.og.title,
    description: strings.site.og.description,
    images: [
      { url: '/og/era-og.png', width: 1200, height: 630, alt: strings.site.og.title },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: strings.site.og.title,
    description: strings.site.og.description,
    images: ['/og/era-og.png'],
  },
  icons: {
    icon: [
      { url: '/icon.png', type: 'image/png', sizes: '512x512' },
      { url: '/favicon.ico', sizes: 'any' },
    ],
    shortcut: ['/favicon.ico'],
    apple: [{ url: '/apple-icon.png' }],
  },
};

/**
 * The Explore row's labels, keyed by the graph's {@link FOOTER_LINKS} paths.
 * FOOTER_LINKS is the single source of truth for which pages the footer surfaces
 * (and for the seo-graph reachability test); these are just their sentence-case
 * anchor labels.
 */
const EXPLORE_LABELS: Record<(typeof FOOTER_LINKS)[number], string> = {
  '/journal': 'Journal',
  '/styles': 'Style guide',
  '/virtual-wardrobe': 'Virtual wardrobe',
  '/ai-stylist': 'AI stylist',
  '/outfit-planner': 'Outfit planner',
};

/**
 * Quiet footer for the public surface — a hairline rule over muted rows of links.
 * Light touch by design: the Explore row links out to the Layer-2 SEO surfaces
 * (journal, style guide, the three pillars) so every one of them is reachable from
 * the front door — the footer edges the zero-orphan link graph depends on — and
 * the Legal row keeps Privacy + Terms one tap away. Tokens throughout; no motion.
 */
function SiteFooter() {
  return (
    <footer style={footerStyle}>
      <nav style={footerNavStyle} aria-label="Explore">
        {FOOTER_LINKS.map((path) => (
          <Link key={path} href={path} style={footerLinkStyle}>
            {EXPLORE_LABELS[path]}
          </Link>
        ))}
      </nav>
      <div style={footerBottomStyle}>
        <Text variant="caption" style={footerBrandStyle}>
          © Era
        </Text>
        <nav style={footerNavStyle} aria-label="Legal">
          <Link href="/privacy" style={footerLinkStyle}>
            Privacy
          </Link>
          <Link href="/terms" style={footerLinkStyle}>
            Terms
          </Link>
        </nav>
      </div>
    </footer>
  );
}

const footerStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: 'var(--space-4)',
  paddingBlock: 'var(--space-8)',
  paddingInline: 'var(--space-4)',
  marginTop: 'var(--space-16)',
  borderTop: '1px solid var(--color-hairline)',
};

const footerBottomStyle: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 'var(--space-4)',
};

const footerBrandStyle: CSSProperties = {
  fontSize: typeRamp.footnote.rem,
  lineHeight: `${typeRamp.footnote.lineHeight}px`,
  color: 'var(--color-secondary-strong)',
};

const footerNavStyle: CSSProperties = {
  display: 'inline-flex',
  flexWrap: 'wrap',
  justifyContent: 'center',
  gap: 'var(--space-4)',
};

const footerLinkStyle: CSSProperties = {
  fontSize: typeRamp.footnote.rem,
  lineHeight: `${typeRamp.footnote.lineHeight}px`,
  color: 'var(--color-secondary-strong)',
  textDecoration: 'none',
};

export default function SiteLayout({ children }: { children: ReactNode }) {
  return (
    <div>
      <Pageview />
      {children}
      <SiteFooter />
    </div>
  );
}
