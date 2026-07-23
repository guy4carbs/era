/**
 * welcome — sent on a new user's first sign-in. Warm and brief: the serif
 * headline, one body line that names the first move, and a single button in.
 *
 * `name` greets the user; the live send passes a neutral 'there' (the first-
 * sign-in flow carries no name yet), and the copy — `strings.emails.welcome.body`
 * — reads naturally either way. Named export for the barrel; default for preview.
 */
import { Section, Text } from '@react-email/components';
import type { CSSProperties } from 'react';

import { BaseEmail } from '../BaseEmail.tsx';
import { EmailButton } from '../EmailButton.tsx';
import { emailColors, emailFonts, emailType } from '../tokens.ts';
import { strings } from '@era/core/strings';

const copy = strings.emails.welcome;

const h1Style: CSSProperties = {
  fontFamily: emailFonts.headline,
  fontSize: emailType.h1.sizePx,
  letterSpacing: emailType.h1.letterSpacing,
  lineHeight: emailType.h1.leading,
  color: emailColors.text,
  fontWeight: 500,
  margin: '0 0 24px 0',
};

const bodyStyle: CSSProperties = {
  fontFamily: emailFonts.body,
  fontSize: emailType.body.sizePx,
  lineHeight: emailType.body.leading,
  color: emailColors.text,
  margin: '0 0 24px 0',
};

export interface WelcomeEmailProps {
  /** The name to greet — a neutral 'there' when the send carries none. */
  readonly name: string;
  /** The link the CTA opens — the app's entry point for this user. */
  readonly appUrl: string;
}

export function WelcomeEmail({ name, appUrl }: WelcomeEmailProps): React.JSX.Element {
  return (
    <BaseEmail previewText={copy.headline}>
      <Section>
        <Text className="email-text" style={h1Style}>
          {copy.headline}
        </Text>
        <Text className="email-text" style={bodyStyle}>
          {copy.body(name)}
        </Text>
      </Section>

      <EmailButton label={copy.cta} href={appUrl} />
    </BaseEmail>
  );
}

/** Realistic sample data for `email dev`. */
WelcomeEmail.PreviewProps = {
  name: 'Guy',
  appUrl: 'https://era.style',
} satisfies WelcomeEmailProps;

export default WelcomeEmail;
