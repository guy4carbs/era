import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { Fraunces } from 'next/font/google';
import { GeistSans } from 'geist/font/sans';
import { ThemeProvider } from '../lib/theme';
import { themeVarsCss, responsiveCss, noFlashScript } from '../lib/theme-css';
import { ReporterBoot } from '../components/system/ReporterBoot';
import { siteUrl } from '../lib/site-url';
import './globals.css';

/**
 * Brand type system, hoisted to the root so every route group inherits it.
 *
 * Fraunces is loaded as a VARIABLE font — the non-default `opsz`/`SOFT`/`WONK`
 * axes stay live so the `<Text>` component can drive them per role via
 * `font-variation-settings` (wght is left variable too; roles set their own
 * weight). It publishes `--font-era-serif`, which the token contract reads.
 *
 * Geist Sans ships its own `--font-geist-sans`; `globals.css` aliases that to the
 * token's `--font-era-sans` so the `fontFamilies.cssVar` contract holds.
 */
const fraunces = Fraunces({
  subsets: ['latin'],
  axes: ['opsz', 'SOFT', 'WONK'],
  style: ['normal', 'italic'],
  display: 'swap',
  variable: '--font-era-serif',
});

export const metadata: Metadata = {
  // App-wide absolute-URL base so any route's relative canonical/OG resolves,
  // even outside the (site) group. Reads the single canonical origin via siteUrl().
  metadataBase: new URL(siteUrl()),
  title: 'Era',
  description: 'Your virtual wardrobe.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${fraunces.variable} ${GeistSans.variable}`}
    >
      <head>
        {/* Token-generated theme variables + responsive rules. */}
        <style dangerouslySetInnerHTML={{ __html: `${themeVarsCss}\n${responsiveCss}` }} />
        {/* Sets data-theme before first paint so there is no light/dark flash. */}
        <script dangerouslySetInnerHTML={{ __html: noFlashScript }} />
      </head>
      <body>
        {/* Warms the error reporter (Sentry when a DSN is set; dormant otherwise). */}
        <ReporterBoot />
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
