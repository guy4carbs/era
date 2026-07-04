import { type CSSProperties } from 'react';
import { strings } from '@era/core/strings';
import { typeRamp } from '@era/tokens';
import { ScrollReveal } from './ScrollReveal';
import { WaitlistForm } from './WaitlistForm';

/**
 * The closing beat: the promise restated, then the waitlist form. Anchored as
 * `#waitlist` so the hero CTA scrolls here. Server Component wrapper — only the
 * form ({@link WaitlistForm}) is interactive.
 */

const titleLineHeight = typeRamp.largeTitle.lineHeight / typeRamp.largeTitle.px;

const sectionStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: 'var(--space-8)',
  textAlign: 'center',
  paddingBlock: 'var(--space-16)',
};

const titleStyle: CSSProperties = {
  margin: 0,
  fontFamily: 'var(--font-era-serif), Georgia, serif',
  fontWeight: 500,
  fontSize: `clamp(${typeRamp.title1.rem}, 6vw, ${typeRamp.largeTitle.rem})`,
  lineHeight: titleLineHeight,
  letterSpacing: '-0.02em',
  color: 'var(--color-text)',
  maxWidth: '18ch',
};

// Constrain the form to a single comfortable column (feed-column token width).
const formWrapStyle: CSSProperties = {
  width: '100%',
  maxWidth: 'var(--feed-col)',
};

export function Closer() {
  return (
    <ScrollReveal>
      <section id="waitlist" style={sectionStyle}>
        <h2 style={titleStyle}>{strings.site.closer.title}</h2>
        <div style={formWrapStyle}>
          <WaitlistForm />
        </div>
      </section>
    </ScrollReveal>
  );
}
