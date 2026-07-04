import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { Fraunces } from 'next/font/google';
import { strings } from '@era/core/strings';
import { Pageview } from '../../components/site';

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

/**
 * Absolute base for Open Graph / Twitter asset URLs. Reads the deploy-provided
 * `NEXT_PUBLIC_SITE_URL` (set by Anchor), falling back to localhost for dev so
 * `metadataBase` is always a valid absolute URL.
 */
const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: strings.site.og.title,
  description: strings.site.meta.description,
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

export default function SiteLayout({ children }: { children: ReactNode }) {
  return (
    <div className={serif.variable}>
      <Pageview />
      {children}
    </div>
  );
}
