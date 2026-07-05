import type { CSSProperties } from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';

/**
 * Global 404, served by Next for any unmatched path. A quiet, on-brand dead end:
 * centred, token-driven, a single way back home. It renders under the root
 * layout (ThemeProvider + token CSS vars), so it inherits light/dark without any
 * client JS of its own — this stays a server component.
 *
 * 404 vs 410: an unmatched or not-yet-existing path is a soft "not found" (this
 * page). For content that was public and is now *permanently* removed — a
 * deleted public profile, a retired `/styles/{archetype}` — return HTTP 410 Gone
 * from that route so crawlers drop it fast instead of retrying a 404. Next's
 * `notFound()` renders THIS page with a 404, so use the `gone()` helper in
 * `src/lib/http.ts` from a route handler / server component that owns the
 * removed resource. See that file for the pattern.
 */
export const metadata: Metadata = {
  title: 'Page not found — Era',
  // Belt-and-braces: 404s are noindex by status already, but say so explicitly.
  robots: { index: false, follow: false },
};

const wrapStyle: CSSProperties = {
  minHeight: '60vh',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 'var(--space-4)',
  paddingBlock: 'var(--space-16)',
  paddingInline: 'var(--space-4)',
  textAlign: 'center',
};

const codeStyle: CSSProperties = {
  fontSize: 'var(--type-title-1-rem, 1.75rem)',
  color: 'var(--color-secondary-strong)',
  letterSpacing: '0.02em',
};

const titleStyle: CSSProperties = {
  fontSize: 'var(--type-large-title-rem, 2.25rem)',
  color: 'var(--color-primary)',
  margin: 0,
};

const bodyStyle: CSSProperties = {
  color: 'var(--color-secondary)',
  maxWidth: '40ch',
};

const linkStyle: CSSProperties = {
  marginTop: 'var(--space-2)',
  color: 'var(--color-accent)',
  textDecoration: 'none',
};

export default function NotFound() {
  return (
    <main style={wrapStyle}>
      <span style={codeStyle}>404</span>
      <h1 style={titleStyle}>This page slipped out of your closet</h1>
      <p style={bodyStyle}>
        The page you were looking for doesn&rsquo;t exist, or it moved somewhere new.
      </p>
      <Link href="/" style={linkStyle}>
        Back to Era &rarr;
      </Link>
    </main>
  );
}
