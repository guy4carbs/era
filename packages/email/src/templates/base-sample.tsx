/**
 * base-sample — the proof template for `@era/email`.
 *
 * It extends `BaseEmail` and exercises every slot the layout offers: preview
 * text, an editorial h1 in the Georgia (Fraunces stand-in) headline stack, a
 * body paragraph in the system-sans stack, a muted-rust cautionary line, the
 * hairline dividers, and the footer WITH an unsubscribe URL (the marketing-send
 * shape). Copy is on Ovi's voice — warm, plain, no exclamation marks.
 *
 * It carries BOTH a default export (react-email's preview server and `email dev`
 * require it) and a named export (the barrel and `renderEmail` import the named
 * one). The default export is why this package's eslint config relaxes the
 * shared `no-restricted-exports` rule for `src/templates/**`.
 */
import { Section, Text } from '@react-email/components';
import type { CSSProperties } from 'react';

import { BaseEmail } from '../BaseEmail.tsx';
import { emailColors, emailFonts, emailType } from '../tokens.ts';

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

const cautionStyle: CSSProperties = {
  fontFamily: emailFonts.body,
  fontSize: emailType.caption.sizePx,
  lineHeight: emailType.caption.leading,
  color: emailColors.caution,
  margin: 0,
};

const EXAMPLE_UNSUBSCRIBE_URL = 'https://era.style/unsubscribe/example';

export function BaseSampleEmail(): React.JSX.Element {
  return (
    <BaseEmail
      previewText="A quiet look at the week's era — the pieces earning their place."
      unsubscribeUrl={EXAMPLE_UNSUBSCRIBE_URL}
    >
      <Section>
        <Text className="email-text" style={h1Style}>
          The Era Edit
        </Text>
        <Text className="email-text" style={bodyStyle}>
          This week leaned quiet — softer layers, fewer decisions, the pieces you
          reach for without thinking. I pulled a few looks from what you already
          own, so there&rsquo;s nothing to buy and nothing to set up. Open the app
          when you have a minute and they&rsquo;ll be waiting.
        </Text>
        <Text className="email-secondary" style={cautionStyle}>
          You&rsquo;re getting this because you asked Era to send the weekly edit.
        </Text>
      </Section>
    </BaseEmail>
  );
}

export default BaseSampleEmail;
