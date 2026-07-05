import { type CSSProperties } from 'react';
import { strings } from '@era/core/strings';
import { typeRamp } from '@era/tokens';
import { ScrollReveal } from './ScrollReveal';

/**
 * The landing FAQ — a quiet "Common questions" block that renders
 * `strings.site.faq` as an editorial definition list. This is the *visible*
 * counterpart to the FAQPage JSON-LD on the landing: Google requires the
 * schema's Q&A text to be present on the page, so the two read from the same
 * source of truth. Presentational Server Component; the only client boundary is
 * the {@link ScrollReveal} wrapper, which renders statically under reduced
 * motion.
 */

// Heading uses largeTitle's own line-height ratio (derived — no literal).
const titleLineHeight = typeRamp.largeTitle.lineHeight / typeRamp.largeTitle.px;

const sectionStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-8)',
  paddingBlock: 'var(--space-16)',
};

const headingStyle: CSSProperties = {
  margin: 0,
  fontFamily: 'var(--font-era-serif), Georgia, serif',
  fontWeight: 500,
  fontSize: `clamp(${typeRamp.title2.rem}, 4.5vw, ${typeRamp.largeTitle.rem})`,
  lineHeight: titleLineHeight,
  letterSpacing: '-0.01em',
  color: 'var(--color-text)',
};

const listStyle: CSSProperties = {
  margin: 0,
  display: 'flex',
  flexDirection: 'column',
};

// Each Q&A pair sits over a hairline rule — the same quiet divider the footer uses.
const itemStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-2)',
  paddingBlock: 'var(--space-8)',
  borderTop: '1px solid var(--color-hairline)',
};

const questionStyle: CSSProperties = {
  margin: 0,
  fontFamily: 'var(--font-era-serif), Georgia, serif',
  fontWeight: 500,
  fontSize: typeRamp.title3.rem,
  lineHeight: `${typeRamp.title3.lineHeight}px`,
  letterSpacing: '-0.01em',
  color: 'var(--color-text)',
};

const answerStyle: CSSProperties = {
  margin: 0,
  marginInlineStart: 0, // reset the default <dd> indent
  fontSize: typeRamp.body.rem,
  lineHeight: `${typeRamp.body.lineHeight}px`,
  color: 'var(--color-secondary-strong)',
  maxWidth: '54ch',
};

export function FaqSection() {
  return (
    <ScrollReveal>
      <section style={sectionStyle} aria-labelledby="faq-heading">
        <h2 id="faq-heading" style={headingStyle}>
          Common questions
        </h2>
        <dl style={listStyle}>
          {strings.site.faq.map((entry) => (
            <div key={entry.q} style={itemStyle}>
              <dt style={questionStyle}>{entry.q}</dt>
              <dd style={answerStyle}>{entry.a}</dd>
            </div>
          ))}
        </dl>
      </section>
    </ScrollReveal>
  );
}
