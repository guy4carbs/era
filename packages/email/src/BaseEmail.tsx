/**
 * BaseEmail — the layout every Era email template extends.
 *
 * A 600px centered container on the warm cream canvas, the `era.` wordmark at
 * top center (a hosted 2× PNG — email can't inline the SVG mark), hairline
 * dividers framing the content, and the compliant footer. Every color, size,
 * and dimension comes from `./tokens` (derived from `@era/tokens`) — never a raw
 * hex in this file.
 *
 * Dark mode is handled two ways at once, because email clients disagree: the
 * `color-scheme` metas + a `prefers-color-scheme` `<style>` block let clients
 * that honor the scheme (Apple Mail) recolor the classed elements to the dark
 * palette, while the wordmark stays a baked-cream-field PNG so a force-inverting
 * client (Gmail) darkens the surround without wrecking the mark.
 *
 * The footer's unsubscribe link renders ONLY when a send passes `unsubscribeUrl`
 * — marketing sends (The Era Edit) carry it and satisfy CAN-SPAM; transactional
 * sends omit it. The physical mailing address (from `@era/core` strings) is
 * always present.
 */
import {
  Body,
  Container,
  Head,
  Hr,
  Html,
  Img,
  Link,
  Preview,
  Section,
  Text,
} from '@react-email/components';
import { strings } from '@era/core/strings';
import type { CSSProperties, ReactNode } from 'react';

import {
  emailColors,
  emailColorsDark,
  emailFonts,
  emailLayout,
  emailType,
} from './tokens.ts';

export interface BaseEmailProps {
  /** The inbox-preview snippet (the dim text beside the subject in a list view). */
  readonly previewText: string;
  /** The email's body — headline, paragraphs, whatever the template composes. */
  readonly children: ReactNode;
  /**
   * When present, the footer renders an unsubscribe link beside the address —
   * the marketing-send signal. Omit it for transactional sends.
   */
  readonly unsubscribeUrl?: string;
  /**
   * When present, a 'Preferences' link renders beside Unsubscribe — the signed
   * per-recipient preferences page (The Era Edit). Omit it for transactional
   * sends, which carry neither footer link.
   */
  readonly preferencesUrl?: string;
}

/**
 * The `prefers-color-scheme` recolor block. Targets the classed elements the
 * layout tags (`.email-canvas`, `.email-text`, `.email-hairline`,
 * `.email-secondary`) and swaps them to the dark palette. Built from
 * `emailColorsDark` as a string so a client that honors the scheme applies it;
 * one that doesn't simply ignores the media query and keeps the light inline
 * styles.
 */
const darkModeCss = `
  @media (prefers-color-scheme: dark) {
    .email-canvas { background-color: ${emailColorsDark.canvas} !important; }
    .email-text { color: ${emailColorsDark.text} !important; }
    .email-secondary { color: ${emailColorsDark.secondary} !important; }
    .email-hairline { border-color: ${emailColorsDark.hairline} !important; }
  }
`;

const bodyStyle: CSSProperties = {
  backgroundColor: emailColors.canvas,
  fontFamily: emailFonts.body,
  margin: 0,
  padding: 0,
};

const containerStyle: CSSProperties = {
  backgroundColor: emailColors.canvas,
  maxWidth: emailLayout.maxWidthPx,
  margin: '0 auto',
  padding: emailLayout.padPx,
};

const markSectionStyle: CSSProperties = {
  textAlign: 'center',
};

// react-email's Img renders display:block, which ignores the parent's
// textAlign — auto side margins are what actually center it in clients.
const markImgStyle: CSSProperties = {
  margin: '0 auto',
};

const hrStyle: CSSProperties = {
  borderColor: emailColors.hairline,
  borderStyle: 'solid',
  borderWidth: '0 0 1px 0',
  margin: `${emailLayout.padPx}px 0`,
};

const footerTextStyle: CSSProperties = {
  fontFamily: emailFonts.body,
  fontSize: emailType.caption.sizePx,
  lineHeight: emailType.caption.leading,
  color: emailColors.secondary,
  margin: 0,
  textAlign: 'center',
};

const unsubscribeLinkStyle: CSSProperties = {
  color: emailColors.secondary,
  textDecoration: 'underline',
};

export function BaseEmail({ previewText, children, unsubscribeUrl, preferencesUrl }: BaseEmailProps): React.JSX.Element {
  const footer = strings.emails.footer;
  const preferencesLabel = strings.emails.theEraEdit.preferences;

  return (
    <Html lang="en">
      <Head>
        <meta name="color-scheme" content="light dark" />
        <meta name="supported-color-schemes" content="light dark" />
        <style dangerouslySetInnerHTML={{ __html: darkModeCss }} />
      </Head>
      <Preview>{previewText}</Preview>
      <Body className="email-canvas" style={bodyStyle}>
        <Container className="email-canvas" style={containerStyle}>
          <Section style={markSectionStyle}>
            <Img
              src={emailLayout.markSrc}
              width={emailLayout.markWidthPx}
              height={Math.round((emailLayout.markWidthPx * 122) / 280)}
              alt="era."
              style={markImgStyle}
            />
          </Section>

          <Hr className="email-hairline" style={hrStyle} />

          {children}

          <Hr className="email-hairline" style={hrStyle} />

          <Section>
            <Text className="email-secondary" style={footerTextStyle}>
              {footer.address}
              {unsubscribeUrl ? (
                <>
                  {'  ·  '}
                  <Link href={unsubscribeUrl} className="email-secondary" style={unsubscribeLinkStyle}>
                    {footer.unsubscribe}
                  </Link>
                </>
              ) : null}
              {preferencesUrl ? (
                <>
                  {'  ·  '}
                  <Link href={preferencesUrl} className="email-secondary" style={unsubscribeLinkStyle}>
                    {preferencesLabel}
                  </Link>
                </>
              ) : null}
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}
