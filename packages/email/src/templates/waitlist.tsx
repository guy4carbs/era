/**
 * waitlist — the pre-launch waitlist confirmation, restyled onto BaseEmail.
 *
 * This email CONFIRMS; it doesn't push. So its one action is a quiet link to
 * era.style, never a button — the one-clear-action rule resolves to the link
 * (the email tells you you're in; it doesn't need to drive a click). The serif
 * headline is the gift voice ("You're in."). When a `position` number is passed,
 * the numeral itself renders large in the serif stack, with the screen-reader /
 * text position label beneath as the caption. Then the referral line, the quiet
 * era.style link, the small pricing-honesty line, and the quiet closer.
 *
 * Named export for the barrel; default for preview.
 */
import { Link, Section, Text } from '@react-email/components';
import type { CSSProperties } from 'react';

import { BaseEmail } from '../BaseEmail.tsx';
import { emailColors, emailFonts, emailType } from '../tokens.ts';
import { strings } from '@era/core/strings';

const gift = strings.site.gift;
const waitlistCopy = strings.emails.waitlist;

const h1Style: CSSProperties = {
  fontFamily: emailFonts.headline,
  fontSize: emailType.h1.sizePx,
  letterSpacing: emailType.h1.letterSpacing,
  lineHeight: emailType.h1.leading,
  color: emailColors.text,
  fontWeight: 500,
  margin: '0 0 24px 0',
};

// The place-in-line numeral: the biggest serif beat, so it reads as the moment.
const positionNumeralStyle: CSSProperties = {
  fontFamily: emailFonts.headline,
  fontSize: emailType.h1.sizePx * 2,
  letterSpacing: emailType.h1.letterSpacing,
  lineHeight: 1.05,
  color: emailColors.text,
  fontWeight: 500,
  margin: '0 0 4px 0',
};

const positionLabelStyle: CSSProperties = {
  fontFamily: emailFonts.body,
  fontSize: emailType.caption.sizePx,
  lineHeight: emailType.caption.leading,
  color: emailColors.secondary,
  margin: '0 0 24px 0',
};

const bodyStyle: CSSProperties = {
  fontFamily: emailFonts.body,
  fontSize: emailType.body.sizePx,
  lineHeight: emailType.body.leading,
  color: emailColors.text,
  margin: '0 0 24px 0',
};

const linkStyle: CSSProperties = {
  fontFamily: emailFonts.body,
  fontSize: emailType.body.sizePx,
  lineHeight: emailType.body.leading,
  color: emailColors.text,
  textDecoration: 'underline',
};

const noteStyle: CSSProperties = {
  fontFamily: emailFonts.body,
  fontSize: emailType.caption.sizePx,
  lineHeight: emailType.caption.leading,
  color: emailColors.secondary,
  margin: '24px 0 20px 0',
};

const closerStyle: CSSProperties = {
  fontFamily: emailFonts.body,
  fontSize: emailType.caption.sizePx,
  lineHeight: emailType.caption.leading,
  color: emailColors.secondary,
  margin: 0,
};

/** era.style is the one place the quiet link points. */
const ERA_URL = 'https://era.style';

export interface WaitlistEmailProps {
  /** The joiner's 1-based place in line — the numeral renders large when present. */
  readonly position?: number;
}

export function WaitlistEmail({ position }: WaitlistEmailProps): React.JSX.Element {
  const hasPosition = typeof position === 'number' && Number.isFinite(position);

  return (
    <BaseEmail previewText={gift.email.line}>
      <Section>
        <Text className="email-text" style={h1Style}>
          {gift.email.subject}
        </Text>

        {hasPosition ? (
          <>
            <Text className="email-text" style={positionNumeralStyle}>
              {position}
            </Text>
            <Text className="email-secondary" style={positionLabelStyle}>
              {gift.positionLabel(position!)}
            </Text>
          </>
        ) : null}

        <Text className="email-text" style={bodyStyle}>
          {gift.email.line}
        </Text>

        <Link href={ERA_URL} className="email-text" style={linkStyle}>
          {gift.email.linkLabel}
        </Link>

        <Text className="email-secondary" style={noteStyle}>
          {waitlistCopy.pricingNote}
        </Text>
        <Text className="email-secondary" style={closerStyle}>
          {waitlistCopy.closer}
        </Text>
      </Section>
    </BaseEmail>
  );
}

/** Realistic sample data for `email dev` — a mid-list place in line. */
WaitlistEmail.PreviewProps = {
  position: 214,
} satisfies WaitlistEmailProps;

export default WaitlistEmail;
