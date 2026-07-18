import { type CSSProperties, type ReactNode } from 'react';
import Link from 'next/link';
import { Text } from '../../components/Text';

/**
 * Chrome for the public profile surface (`/{username}`), which otherwise inherits
 * only the bare root layout. A stranger arriving from a shared link needs at
 * least one Era touchpoint — and screenshots of the page should carry the brand —
 * so this adds ONE quiet wordmark linking home, above the profile. No nav, no
 * banner: just the mark, in the editorial serif. The Fraunces/Geist type system
 * (`--font-era-serif`) is loaded once at the root layout and inherited here.
 */

export default function ProfileLayout({ children }: { children: ReactNode }) {
  return (
    <div>
      <header style={barStyle}>
        <div className="era-container">
          <Link href="/" aria-label="Era home" style={{ textDecoration: 'none' }}>
            <Text variant="title" as="span" size="title3" style={wordmarkStyle}>
              Era
            </Text>
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
  fontWeight: 600,
  letterSpacing: '0.01em',
  color: 'var(--color-text)',
};
