/**
 * deletion — the account-deletion confirmation, sent after an account is gone.
 *
 * There is nothing to do here — that's the point — so there is NO button: the
 * serif headline ("Taken care of."), the body confirming a real, permanent
 * delete, and the warm guilt-free closer. Era never tries to win the user back.
 *
 * Named export for the barrel; default for preview.
 */
import { Section, Text } from '@react-email/components';
import type { CSSProperties } from 'react';

import { BaseEmail } from '../BaseEmail.tsx';
import { emailColors, emailFonts, emailType } from '../tokens.ts';
import { strings } from '@era/core/strings';

const copy = strings.emails.deletion;

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
  margin: '0 0 20px 0',
};

const closerStyle: CSSProperties = {
  fontFamily: emailFonts.body,
  fontSize: emailType.caption.sizePx,
  lineHeight: emailType.caption.leading,
  color: emailColors.secondary,
  margin: 0,
};

export function DeletionEmail(): React.JSX.Element {
  return (
    <BaseEmail previewText={copy.headline}>
      <Section>
        <Text className="email-text" style={h1Style}>
          {copy.headline}
        </Text>
        <Text className="email-text" style={bodyStyle}>
          {copy.body}
        </Text>
        <Text className="email-secondary" style={closerStyle}>
          {copy.closer}
        </Text>
      </Section>
    </BaseEmail>
  );
}

/** No props — the deletion email is fixed copy; PreviewProps stays empty. */
DeletionEmail.PreviewProps = {} satisfies Record<string, never>;

export default DeletionEmail;
