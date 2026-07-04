import { type CSSProperties } from 'react';
import { typeRamp, boxShadows, glass } from '@era/tokens';
import { ScrollReveal } from './ScrollReveal';

export interface FeatureSectionProps {
  /** Zero-based position in the scroll — rendered as an editorial "01" index. */
  index: number;
  title: string;
  body: string;
}

// Section title: fluid between title2 and largeTitle, using largeTitle's own
// line-height ratio (derived — no literal introduced).
const titleLineHeight = typeRamp.largeTitle.lineHeight / typeRamp.largeTitle.px;

// Glass panel — the same frosted recipe as the design system's sheets: a mode
// tint over a backdrop blur, a hairline border, and a 1px inner top highlight.
const panelStyle: CSSProperties = {
  position: 'relative',
  overflow: 'hidden',
  background: 'color-mix(in srgb, var(--color-surface) var(--glass-tint), transparent)',
  backdropFilter: 'blur(var(--glass-blur))',
  WebkitBackdropFilter: 'blur(var(--glass-blur))',
  border: 'var(--glass-border-width) solid var(--color-hairline)',
  borderRadius: 'var(--radius-hero)',
  boxShadow: `${boxShadows.e3}, inset 0 1px 0 0 ${glass.innerHighlightColor}`,
  padding: 'var(--space-12)',
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-4)',
};

const indexStyle: CSSProperties = {
  margin: 0,
  fontFamily: 'var(--font-era-serif), Georgia, serif',
  fontSize: typeRamp.subhead.rem,
  lineHeight: `${typeRamp.subhead.lineHeight}px`,
  letterSpacing: '0.14em',
  color: 'var(--color-secondary-strong)',
};

const titleStyle: CSSProperties = {
  margin: 0,
  fontFamily: 'var(--font-era-serif), Georgia, serif',
  fontWeight: 500,
  fontSize: `clamp(${typeRamp.title2.rem}, 4.5vw, ${typeRamp.largeTitle.rem})`,
  lineHeight: titleLineHeight,
  letterSpacing: '-0.01em',
  color: 'var(--color-text)',
  maxWidth: '18ch',
};

const bodyStyle: CSSProperties = {
  margin: 0,
  fontSize: typeRamp.title3.rem,
  lineHeight: `${typeRamp.title3.lineHeight}px`,
  color: 'var(--color-secondary-strong)',
  maxWidth: '38ch',
};

/**
 * One editorial value section, rendered as a frosted glass panel and revealed on
 * scroll. Presentational Server Component — the client boundary is confined to
 * the {@link ScrollReveal} wrapper, so the panel's content is server-rendered.
 */
export function FeatureSection({ index, title, body }: FeatureSectionProps) {
  const ordinal = String(index + 1).padStart(2, '0');
  return (
    <ScrollReveal>
      <article style={panelStyle}>
        <p style={indexStyle}>{ordinal}</p>
        <h2 style={titleStyle}>{title}</h2>
        <p style={bodyStyle}>{body}</p>
      </article>
    </ScrollReveal>
  );
}
