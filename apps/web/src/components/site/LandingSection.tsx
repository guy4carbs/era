import { type CSSProperties, type ReactNode } from 'react';
import { typeRamp } from '@era/tokens';
import { Text } from '../Text';
import { ScrollReveal } from './ScrollReveal';

export interface LandingSectionProps {
  /** Zero-based scroll position — rendered as an editorial "01" ordinal. */
  index: number;
  title: string;
  body: string;
  /**
   * The live embed for this section (real ItemSurfaces, the Ovi stream, the era
   * rail). Omitted for the quiet editorial block (section 4), which is the shell
   * with copy alone.
   */
  children?: ReactNode;
}

// Section head: fluid title2→largeTitle on largeTitle's own leading ratio
// (derived — no literal). Mirrors FeatureSection so the register is consistent.
const titleLineHeight = typeRamp.largeTitle.lineHeight / typeRamp.largeTitle.px;

const sectionStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-8)',
};

const copyStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-4)',
  maxWidth: 'var(--content-max)',
};

// Editorial ordinal — tracked metadata, sans (a serif here would sit below the
// 20px serif floor).
const indexStyle: CSSProperties = {
  margin: 0,
  letterSpacing: '0.14em',
  color: 'var(--color-secondary-strong)',
};

const titleStyle: CSSProperties = {
  margin: 0,
  fontSize: `clamp(${typeRamp.title2.rem}, 4.5vw, ${typeRamp.largeTitle.rem})`,
  lineHeight: titleLineHeight,
  color: 'var(--color-text)',
  maxWidth: '18ch',
};

const bodyStyle: CSSProperties = {
  margin: 0,
  color: 'var(--color-secondary-strong)',
  maxWidth: '38ch',
};

/**
 * The shared editorial shell for the scroll-driven landing sections: an ordinal,
 * a serif head, the body from `strings.site.sections`, then the section's live
 * embed. Presentational Server Component — the client boundary is confined to
 * the {@link ScrollReveal} wrapper (which reveals once the section is a third on
 * screen) and whatever embed each section passes in. Section 4 passes no embed
 * and renders as a quiet copy-only editorial beat.
 */
export function LandingSection({ index, title, body, children }: LandingSectionProps) {
  const ordinal = String(index + 1).padStart(2, '0');
  return (
    <ScrollReveal amount={0.3}>
      <section style={sectionStyle}>
        <div style={copyStyle}>
          <Text variant="caption" as="p" size="subhead" style={indexStyle}>
            {ordinal}
          </Text>
          <Text variant="largeTitle" as="h2" style={titleStyle}>
            {title}
          </Text>
          <Text variant="body" as="p" size="title3" style={bodyStyle}>
            {body}
          </Text>
        </div>
        {children}
      </section>
    </ScrollReveal>
  );
}
