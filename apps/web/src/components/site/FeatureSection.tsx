import { type CSSProperties } from 'react';
import { typeRamp } from '@era/tokens';
import { Text } from '../Text';
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
  border: 'var(--glass-border-width) solid var(--glass-border)',
  borderRadius: 'var(--radius-hero)',
  boxShadow: 'var(--shadow-e3), inset 0 1px 0 0 var(--glass-highlight)',
  padding: 'var(--space-12)',
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-4)',
};

// Editorial ordinal — tracked metadata at subhead size. Sans (caption): a serif
// here would sit below the 20px serif floor.
const indexStyle: CSSProperties = {
  margin: 0,
  letterSpacing: '0.14em',
  color: 'var(--color-secondary-strong)',
};

// Fluid head spanning title2→largeTitle; `largeTitle` supplies the serif face.
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
 * One editorial value section, rendered as a frosted glass panel and revealed on
 * scroll. Presentational Server Component — the client boundary is confined to
 * the {@link ScrollReveal} wrapper, so the panel's content is server-rendered.
 */
export function FeatureSection({ index, title, body }: FeatureSectionProps) {
  const ordinal = String(index + 1).padStart(2, '0');
  return (
    <ScrollReveal>
      <article style={panelStyle}>
        <Text variant="caption" as="p" size="subhead" style={indexStyle}>
          {ordinal}
        </Text>
        <Text variant="largeTitle" as="h2" style={titleStyle}>
          {title}
        </Text>
        <Text variant="body" as="p" size="title3" style={bodyStyle}>
          {body}
        </Text>
      </article>
    </ScrollReveal>
  );
}
