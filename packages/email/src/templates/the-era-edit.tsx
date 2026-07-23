/**
 * the-era-edit — The Era Edit, Era's weekly editorial newsletter.
 *
 * A marketing send, so it carries BOTH footer links (Unsubscribe + Preferences)
 * through BaseEmail. The FIXED format — masthead grammar, section labels, the
 * personalized-stat sentence shapes — comes from `strings.emails.theEraEdit`;
 * the per-issue editorial content is DATA (`EraEditIssue`), so a new issue is a
 * new module and nothing here changes.
 *
 * Structure, top to bottom (under BaseEmail's wordmark): the masthead + issue
 * line, a hairline, the lead editorial (hero + serif headline + body), The
 * Formula (a hairline-ruled list), Your Week, Worn (rendered ONLY when the send
 * carries the recipient's stats — absent entirely for a waitlist broadcast), and
 * The Dispatch (one quiet line above the footer hairline).
 *
 * Small caps is a grammar this template applies (uppercase + wide tracking at
 * caption size), never encoded in the strings. Named export for the barrel;
 * default for the react-email preview.
 */
import { Hr, Img, Section, Text } from '@react-email/components';
import type { CSSProperties } from 'react';

import { BaseEmail } from '../BaseEmail.tsx';
import { emailColors, emailFonts, emailType } from '../tokens.ts';
import type { EraEditIssue } from '../issues/issue-001.ts';
import { issue001 } from '../issues/issue-001.ts';
import { strings } from '@era/core/strings';

const copy = strings.emails.theEraEdit;

/**
 * The recipient's own week, already resolved to display strings by the data
 * layer (`apps/web/src/lib/era-edit-data.ts`) — the template never touches the
 * DB or the wear-stats engine, it only renders. `costPerWear` is null when no
 * owned piece has a usable price; `mostWorn` is always present when this object
 * is (the data layer returns the whole object as null when the week is empty).
 */
export interface WeekWornData {
  readonly mostWorn: { readonly name: string; readonly count: number };
  readonly costPerWear: { readonly name: string; readonly formatted: string } | null;
}

export interface TheEraEditProps {
  /** The issue's editorial content. */
  readonly issue: EraEditIssue;
  /** The recipient's week stats, or null/absent to hide Your Week, Worn. */
  readonly weekWorn?: WeekWornData | null;
  /** The signed unsubscribe URL (marketing footer). */
  readonly unsubscribeUrl: string;
  /** The signed preferences URL (marketing footer). */
  readonly preferencesUrl: string;
}

// -----------------------------------------------------------------------------
// Styles — every value from the email tokens (no raw hex, per the package guard).
// -----------------------------------------------------------------------------

/** The masthead — the serif stack at h1 size, centered. */
const mastheadStyle: CSSProperties = {
  fontFamily: emailFonts.headline,
  fontSize: emailType.h1.sizePx,
  letterSpacing: emailType.h1.letterSpacing,
  lineHeight: emailType.h1.leading,
  color: emailColors.text,
  fontWeight: 500,
  textAlign: 'center',
  margin: '0 0 8px 0',
};

/**
 * Small-caps grammar: uppercase, wide tracking, caption size, secondary color.
 * The one shape shared by the issue line and every section label — the template
 * applies it; the strings stay plain.
 */
const smallCapsStyle: CSSProperties = {
  fontFamily: emailFonts.body,
  fontSize: emailType.caption.sizePx,
  lineHeight: emailType.caption.leading,
  color: emailColors.secondary,
  textTransform: 'uppercase',
  letterSpacing: '0.14em',
  margin: 0,
};

/** The centered issue line beneath the masthead. */
const issueLineStyle: CSSProperties = {
  ...smallCapsStyle,
  textAlign: 'center',
};

/** Section labels sit left, above their content, with air beneath. */
const sectionLabelStyle: CSSProperties = {
  ...smallCapsStyle,
  margin: '0 0 12px 0',
};

const hrStyle: CSSProperties = {
  borderColor: emailColors.hairline,
  borderStyle: 'solid',
  borderWidth: '0 0 1px 0',
  margin: '24px 0',
};

/** The hairline directly under the masthead — tighter than the section rules. */
const mastheadHrStyle: CSSProperties = {
  ...hrStyle,
  margin: '16px 0 24px 0',
};

const heroImgStyle: CSSProperties = {
  display: 'block',
  width: '100%',
  maxWidth: '100%',
  height: 'auto',
  margin: '0 0 24px 0',
};

/** The lead's serif headline — a touch larger than h2, the editorial beat. */
const leadHeadlineStyle: CSSProperties = {
  fontFamily: emailFonts.headline,
  fontSize: emailType.h2.sizePx + 4,
  letterSpacing: emailType.h2.letterSpacing,
  lineHeight: emailType.h2.leading,
  color: emailColors.text,
  fontWeight: 500,
  margin: '0 0 16px 0',
};

const bodyStyle: CSSProperties = {
  fontFamily: emailFonts.body,
  fontSize: emailType.body.sizePx,
  lineHeight: emailType.body.leading,
  color: emailColors.text,
  margin: '0 0 16px 0',
};

/** The last body paragraph in a block drops its trailing margin. */
const bodyLastStyle: CSSProperties = {
  ...bodyStyle,
  margin: 0,
};

/** A Formula line: body-size reading text with generous vertical air. */
const formulaLineStyle: CSSProperties = {
  fontFamily: emailFonts.body,
  fontSize: emailType.body.sizePx,
  lineHeight: emailType.body.leading,
  color: emailColors.text,
  margin: 0,
  padding: '14px 0',
};

/** The hairline BETWEEN formula lines — a full-width rule, no outer margin. */
const formulaRuleStyle: CSSProperties = {
  borderColor: emailColors.hairline,
  borderStyle: 'solid',
  borderWidth: '0 0 1px 0',
  margin: 0,
};

/** Your Week, Worn stat line — body text with the piece name/numeral in serif. */
const weekWornLineStyle: CSSProperties = {
  fontFamily: emailFonts.body,
  fontSize: emailType.body.sizePx,
  lineHeight: emailType.body.leading,
  color: emailColors.text,
  margin: '0 0 12px 0',
};

const weekWornLineLastStyle: CSSProperties = {
  ...weekWornLineStyle,
  margin: 0,
};

/** The serif emphasis inside a stat line — the piece name or the numeral. */
const serifEmphasisStyle: CSSProperties = {
  fontFamily: emailFonts.headline,
};

/** The Dispatch — one quiet caption-size line. */
const dispatchLineStyle: CSSProperties = {
  fontFamily: emailFonts.body,
  fontSize: emailType.caption.sizePx,
  lineHeight: emailType.caption.leading,
  color: emailColors.secondary,
  margin: 0,
};

/**
 * Split a stat sentence at the piece name so the name can render in the serif
 * without re-authoring the copy. The strings put the name right after "Your ",
 * so we cut on the first occurrence and wrap only that span — the rest stays
 * body text. When the name isn't found (defensive), the whole line renders
 * plainly.
 */
function withSerifName(sentence: string, name: string): React.JSX.Element {
  const index = sentence.indexOf(name);
  if (index === -1) {
    return <>{sentence}</>;
  }
  const before = sentence.slice(0, index);
  const after = sentence.slice(index + name.length);
  return (
    <>
      {before}
      <span style={serifEmphasisStyle}>{name}</span>
      {after}
    </>
  );
}

/**
 * Split the cost-per-wear sentence so BOTH the piece name and the money figure
 * render in the serif. Falls back to the name-only split if the figure isn't
 * present in the sentence.
 */
function withSerifNameAndFigure(sentence: string, name: string, figure: string): React.JSX.Element {
  const figureIndex = sentence.indexOf(figure);
  if (figureIndex === -1) {
    return withSerifName(sentence, name);
  }
  const before = sentence.slice(0, figureIndex);
  const after = sentence.slice(figureIndex + figure.length);
  return (
    <>
      {withSerifName(before, name)}
      <span style={serifEmphasisStyle}>{figure}</span>
      {after}
    </>
  );
}

export function TheEraEdit({ issue, weekWorn, unsubscribeUrl, preferencesUrl }: TheEraEditProps): React.JSX.Element {
  const previewText = issue.lead.headline;

  return (
    <BaseEmail previewText={previewText} unsubscribeUrl={unsubscribeUrl} preferencesUrl={preferencesUrl}>
      {/* Masthead + issue line. */}
      <Section>
        <Text className="email-text" style={mastheadStyle}>
          {copy.masthead}
        </Text>
        <Text className="email-secondary" style={issueLineStyle}>
          {`${copy.issueLabel(issue.number)} · ${issue.date}`}
        </Text>
      </Section>

      <Hr className="email-hairline" style={mastheadHrStyle} />

      {/* Lead editorial: hero, serif headline, body paragraphs. */}
      <Section>
        <Img src={issue.hero.src} width={600} alt={issue.hero.alt} style={heroImgStyle} />
        <Text className="email-text" style={leadHeadlineStyle}>
          {issue.lead.headline}
        </Text>
        {issue.lead.paragraphs.map((paragraph, i) => (
          <Text
            key={i}
            className="email-text"
            style={i === issue.lead.paragraphs.length - 1 ? bodyLastStyle : bodyStyle}
          >
            {paragraph}
          </Text>
        ))}
      </Section>

      <Hr className="email-hairline" style={hrStyle} />

      {/* The Formula — a hairline-ruled list, rule BETWEEN lines only. */}
      <Section>
        <Text className="email-secondary" style={sectionLabelStyle}>
          {copy.sections.formula}
        </Text>
        {issue.formula.lines.map((line, i) => (
          <div key={i}>
            {i > 0 ? <Hr className="email-hairline" style={formulaRuleStyle} /> : null}
            <Text className="email-text" style={formulaLineStyle}>
              {line}
            </Text>
          </div>
        ))}
      </Section>

      {/* Your Week, Worn — rendered ONLY with the recipient's stats. Its own
          hairline + section, so a waitlist send drops the whole block cleanly. */}
      {weekWorn ? (
        <>
          <Hr className="email-hairline" style={hrStyle} />
          <Section>
            <Text className="email-secondary" style={sectionLabelStyle}>
              {copy.sections.weekWorn}
            </Text>
            <Text
              className="email-text"
              style={weekWorn.costPerWear ? weekWornLineStyle : weekWornLineLastStyle}
            >
              {withSerifName(copy.mostWorn(weekWorn.mostWorn.name, weekWorn.mostWorn.count), weekWorn.mostWorn.name)}
            </Text>
            {weekWorn.costPerWear ? (
              <Text className="email-text" style={weekWornLineLastStyle}>
                {withSerifNameAndFigure(
                  copy.costPerWear(weekWorn.costPerWear.name, weekWorn.costPerWear.formatted),
                  weekWorn.costPerWear.name,
                  weekWorn.costPerWear.formatted,
                )}
              </Text>
            ) : null}
          </Section>
        </>
      ) : null}

      <Hr className="email-hairline" style={hrStyle} />

      {/* The Dispatch — one line, directly above BaseEmail's footer hairline. */}
      <Section>
        <Text className="email-secondary" style={sectionLabelStyle}>
          {copy.sections.dispatch}
        </Text>
        <Text className="email-secondary" style={dispatchLineStyle}>
          {issue.dispatch}
        </Text>
      </Section>
    </BaseEmail>
  );
}

/** Realistic sample data for `email dev` — issue 001 with a week-worn fixture. */
TheEraEdit.PreviewProps = {
  issue: issue001,
  weekWorn: {
    mostWorn: { name: 'linen shirt', count: 4 },
    costPerWear: { name: 'linen shirt', formatted: '$12.50' },
  },
  unsubscribeUrl: 'https://era.style/api/email/unsubscribe?email=you%40example.com&token=example',
  preferencesUrl: 'https://era.style/email/preferences?email=you%40example.com&token=example',
} satisfies TheEraEditProps;

export default TheEraEdit;
