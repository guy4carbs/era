import { type CSSProperties } from 'react';
import Link from 'next/link';
import { typeRamp } from '@era/tokens';

import type { SeoLink } from '../../lib/seo-graph';

export interface RelatedLinksProps {
  /** Section label, e.g. "Related" or "Explore". Also the nav's accessible name. */
  readonly label: string;
  /** The target links — anchor text is each link's descriptive `title`. */
  readonly links: readonly SeoLink[];
}

/**
 * A quiet "Related"/"Explore" link block — the on-page realization of the
 * {@link seo-graph} edges. Anchor text is always the target page's descriptive
 * title (never "click here"), which is what makes the internal links useful to
 * both readers and crawlers. Presentational Server Component; tokens throughout.
 */
export function RelatedLinks({ label, links }: RelatedLinksProps) {
  if (links.length === 0) {
    return null;
  }
  return (
    <nav style={sectionStyle} aria-label={label}>
      <h2 style={headingStyle}>{label}</h2>
      <ul style={listStyle}>
        {links.map((link) => (
          <li key={link.path} style={itemStyle}>
            <Link href={link.path} style={linkStyle}>
              {link.title}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

const sectionStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-4)',
  paddingBlock: 'var(--space-8)',
  borderTop: '1px solid var(--color-hairline)',
};

const headingStyle: CSSProperties = {
  margin: 0,
  fontSize: typeRamp.subhead.rem,
  lineHeight: `${typeRamp.subhead.lineHeight}px`,
  fontWeight: 600,
  letterSpacing: '0.02em',
  textTransform: 'uppercase',
  color: 'var(--color-secondary-strong)',
};

const listStyle: CSSProperties = {
  margin: 0,
  padding: 0,
  listStyle: 'none',
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-2)',
};

const itemStyle: CSSProperties = {
  margin: 0,
};

const linkStyle: CSSProperties = {
  fontSize: typeRamp.body.rem,
  lineHeight: `${typeRamp.body.lineHeight}px`,
  color: 'var(--color-accent)',
  fontWeight: 600,
  textDecoration: 'none',
  textUnderlineOffset: '2px',
};
