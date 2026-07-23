/**
 * magic-link — the passwordless sign-in email. One purpose, one button.
 *
 * The serif headline lands the promise, the EmailButton is the single primary
 * action, and a quiet expiry note sits below it. Then the fallback lead-in and
 * the raw url as a breakable secondary link: that paste path is an accessibility
 * need (a client that mangles the button, a copy-into-browser sign-in), NOT a
 * second CTA — it stays small and quiet. A hairline, then the no-alarm ignore
 * line in caption/secondary.
 *
 * Named export for the barrel + `renderEmail`; default export for react-email's
 * preview server and `email dev` (why this package relaxes `no-restricted-exports`
 * for `src/templates/**`).
 */
import { Hr, Link, Section, Text } from '@react-email/components';
import type { CSSProperties } from 'react';

import { BaseEmail } from '../BaseEmail.tsx';
import { EmailButton } from '../EmailButton.tsx';
import { emailColors, emailFonts, emailLayout, emailType } from '../tokens.ts';
import { strings } from '@era/core/strings';

const copy = strings.emails.magicLink;

const h1Style: CSSProperties = {
  fontFamily: emailFonts.headline,
  fontSize: emailType.h1.sizePx,
  letterSpacing: emailType.h1.letterSpacing,
  lineHeight: emailType.h1.leading,
  color: emailColors.text,
  fontWeight: 500,
  margin: '0 0 24px 0',
};

const secondaryStyle: CSSProperties = {
  fontFamily: emailFonts.body,
  fontSize: emailType.caption.sizePx,
  lineHeight: emailType.caption.leading,
  color: emailColors.secondary,
  margin: '0 0 20px 0',
  textAlign: 'center',
};

const fallbackLeadStyle: CSSProperties = {
  fontFamily: emailFonts.body,
  fontSize: emailType.caption.sizePx,
  lineHeight: emailType.caption.leading,
  color: emailColors.secondary,
  margin: '0 0 8px 0',
};

const rawLinkStyle: CSSProperties = {
  fontFamily: emailFonts.body,
  fontSize: emailType.caption.sizePx,
  lineHeight: emailType.caption.leading,
  color: emailColors.secondary,
  wordBreak: 'break-all',
  textDecoration: 'underline',
};

const hrStyle: CSSProperties = {
  borderColor: emailColors.hairline,
  borderStyle: 'solid',
  borderWidth: '0 0 1px 0',
  margin: `${emailLayout.padPx / 2}px 0`,
};

const ignoreStyle: CSSProperties = {
  fontFamily: emailFonts.body,
  fontSize: emailType.caption.sizePx,
  lineHeight: emailType.caption.leading,
  color: emailColors.secondary,
  margin: 0,
};

export interface MagicLinkEmailProps {
  /** The confirm-interstitial sign-in URL the button and fallback link point at. */
  readonly url: string;
}

export function MagicLinkEmail({ url }: MagicLinkEmailProps): React.JSX.Element {
  return (
    <BaseEmail previewText={copy.expiry}>
      <Section>
        <Text className="email-text" style={h1Style}>
          {copy.headline}
        </Text>
      </Section>

      <EmailButton label={copy.cta} href={url} />

      <Section>
        <Text className="email-secondary" style={secondaryStyle}>
          {copy.expiry}
        </Text>
        <Text className="email-secondary" style={fallbackLeadStyle}>
          {copy.fallback}
        </Text>
        <Link href={url} className="email-secondary" style={rawLinkStyle}>
          {url}
        </Link>
      </Section>

      <Hr className="email-hairline" style={hrStyle} />

      <Section>
        <Text className="email-secondary" style={ignoreStyle}>
          {copy.ignore}
        </Text>
      </Section>
    </BaseEmail>
  );
}

/** Realistic sample data so `email dev` renders a believable magic-link email. */
MagicLinkEmail.PreviewProps = {
  url: 'https://era.style/sign-in/confirm?next=%2F',
} satisfies MagicLinkEmailProps;

export default MagicLinkEmail;
