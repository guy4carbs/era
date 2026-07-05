import type { CSSProperties, ReactNode } from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { Fraunces } from 'next/font/google';
import { typeRamp } from '@era/tokens';
import { strings } from '@era/core/strings';
import { Pageview } from '../../components/site';
import { siteUrl } from '../../lib/site-url';

/**
 * Public marketing chrome for the `(site)` route group — the pre-launch landing
 * and waitlist. No TabBar, no auth shell: this layer only carries brand
 * metadata, the editorial display font, and a dormant pageview beacon. The
 * shared `<html>`/`<body>` and ThemeProvider come from the root layout.
 *
 * Editorial serif (Fraunces) is loaded via `next/font` and exposed as the
 * `--font-era-serif` CSS variable that the hero and section titles read; body
 * copy stays on the system stack from `globals.css`. The token comment in
 * `@era/tokens` typography sanctions a serif for editorial "era" titles.
 */
const serif = Fraunces({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-era-serif',
});

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
 * Quiet legal footer for the public surface — a hairline rule over a muted row of
 * links. Light touch by design: it lets the marketing landing (and the legal
 * pages themselves) link out to Privacy + Terms without pulling focus from the
 * hero. Tokens throughout; no motion.
 */
function SiteFooter() {
  return (
    <footer style={footerStyle}>
      <span style={footerBrandStyle}>© Era</span>
      <nav style={footerNavStyle} aria-label="Legal">
        <Link href="/privacy" style={footerLinkStyle}>
          Privacy
        </Link>
        <Link href="/terms" style={footerLinkStyle}>
          Terms
        </Link>
      </nav>
    </footer>
  );
}

const footerStyle: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 'var(--space-4)',
  paddingBlock: 'var(--space-8)',
  paddingInline: 'var(--space-4)',
  marginTop: 'var(--space-16)',
  borderTop: '1px solid var(--color-hairline)',
};

const footerBrandStyle: CSSProperties = {
  fontSize: typeRamp.footnote.rem,
  lineHeight: `${typeRamp.footnote.lineHeight}px`,
  color: 'var(--color-secondary-strong)',
};

const footerNavStyle: CSSProperties = {
  display: 'inline-flex',
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
    <div className={serif.variable}>
      <Pageview />
      {children}
      <SiteFooter />
    </div>
  );
}
