/**
 * launch-invite — the wave-send that opens early access for a waitlist member.
 * The biggest moment this family carries, still calm: the serif headline, one
 * body line, one button in.
 *
 * Built for wave sends — the ONLY per-recipient state is the `accessUrl` prop, so
 * a batch send varies nothing else. Named export for the barrel; default for
 * preview.
 */
import { Section, Text } from '@react-email/components';
import type { CSSProperties } from 'react';

import { BaseEmail } from '../BaseEmail.tsx';
import { EmailButton } from '../EmailButton.tsx';
import { emailColors, emailFonts, emailType } from '../tokens.ts';
import { strings } from '@era/core/strings';

const copy = strings.emails.launchInvite;

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

export interface LaunchInviteEmailProps {
  /** The early-access entry link — the one per-recipient value in a wave send. */
  readonly accessUrl: string;
}

export function LaunchInviteEmail({ accessUrl }: LaunchInviteEmailProps): React.JSX.Element {
  return (
    <BaseEmail previewText={copy.headline}>
      <Section>
        <Text className="email-text" style={h1Style}>
          {copy.headline}
        </Text>
        <Text className="email-text" style={bodyStyle}>
          {copy.body}
        </Text>
      </Section>

      <EmailButton label={copy.cta} href={accessUrl} />
    </BaseEmail>
  );
}

/** Realistic sample data for `email dev`. */
LaunchInviteEmail.PreviewProps = {
  accessUrl: 'https://era.style',
} satisfies LaunchInviteEmailProps;

export default LaunchInviteEmail;
