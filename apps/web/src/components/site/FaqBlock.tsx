import { type CSSProperties } from 'react';
import { typeRamp } from '@era/tokens';
import { Text } from '../Text';

/** One question/answer pair. Structurally matches the pillar/style `faqs` entries. */
export interface FaqBlockEntry {
  readonly q: string;
  readonly a: string;
}

export interface FaqBlockProps {
  /** The Q&A pairs — the SAME entries the page feeds to `faqPageSchema`. */
  readonly faqs: readonly FaqBlockEntry[];
  /** Visible heading. Defaults to "Common questions" (matches the landing FAQ). */
  readonly heading?: string;
}

/**
 * A generalized, static FAQ section for the Layer-2 pages — the visible
 * counterpart to their FAQPage JSON-LD (Google requires the schema's Q&A text to
 * appear on the page, so a page always renders these same entries). This is the
 * parameterized sibling of the landing's {@link FaqSection}, which is hardcoded
 * to `strings.site.faq`; the two share the editorial definition-list look but
 * this one takes its entries as a prop. Presentational Server Component.
 */
export function FaqBlock({ faqs, heading = 'Common questions' }: FaqBlockProps) {
  if (faqs.length === 0) {
    return null;
  }
  return (
    <section style={sectionStyle} aria-labelledby="faq-heading">
      <Text variant="largeTitle" as="h2" id="faq-heading" style={headingStyle}>
        {heading}
      </Text>
      <dl style={listStyle}>
        {faqs.map((entry) => (
          <div key={entry.q} style={itemStyle}>
            <Text variant="title" as="dt" size="title3" style={questionStyle}>
              {entry.q}
            </Text>
            <Text variant="body" as="dd" style={answerStyle}>
              {entry.a}
            </Text>
          </div>
        ))}
      </dl>
    </section>
  );
}

// Heading uses largeTitle's own line-height ratio (derived — no literal), mirroring
// the landing FaqSection so the two read identically.
const titleLineHeight = typeRamp.largeTitle.lineHeight / typeRamp.largeTitle.px;

const sectionStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-8)',
  paddingBlock: 'var(--space-16)',
};

const headingStyle: CSSProperties = {
  margin: 0,
  fontSize: `clamp(${typeRamp.title2.rem}, 4.5vw, ${typeRamp.largeTitle.rem})`,
  lineHeight: titleLineHeight,
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
  color: 'var(--color-text)',
};

const answerStyle: CSSProperties = {
  margin: 0,
  marginInlineStart: 0, // reset the default <dd> indent
  color: 'var(--color-secondary-strong)',
  maxWidth: '54ch',
};
