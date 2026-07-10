import { type CSSProperties, type ReactNode } from 'react';
import Link from 'next/link';
import { Fraunces } from 'next/font/google';
import { typeRamp } from '@era/tokens';

/**
 * Chrome for the public profile surface (`/{username}`), which otherwise inherits
 * only the bare root layout. A stranger arriving from a shared link needs at
 * least one Era touchpoint — and screenshots of the page should carry the brand —
 * so this adds ONE quiet wordmark linking home, above the profile. No nav, no
 * banner: just the mark, matching the `(site)` group's editorial-serif brand
 * treatment (Fraunces via `next/font`, exposed as `--font-era-serif`). Scoped to
 * this segment, so no other route changes.
 */
const serif = Fraunces({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-era-serif',
});

export default function ProfileLayout({ children }: { children: ReactNode }) {
  return (
    <div className={serif.variable}>
      <header style={barStyle}>
        <div className="era-container">
          <Link href="/" style={wordmarkStyle} aria-label="Era home">
            Era
          </Link>
        </div>
      </header>
      {children}
    </div>
  );
}

// A slim brand bar with a hairline underline — quiet, full-width rule, content
// aligned to the same column the profile body uses.
const barStyle: CSSProperties = {
  paddingBlock: 'var(--space-3)',
  borderBottom: '1px solid var(--color-hairline)',
};

const wordmarkStyle: CSSProperties = {
  display: 'inline-block',
  fontFamily: 'var(--font-era-serif), Georgia, serif',
  fontSize: typeRamp.title3.rem,
  lineHeight: `${typeRamp.title3.lineHeight}px`,
  fontWeight: 600,
  letterSpacing: '0.01em',
  color: 'var(--color-text)',
  textDecoration: 'none',
};
