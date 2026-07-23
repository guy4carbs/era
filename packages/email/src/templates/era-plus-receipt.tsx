/**
 * era-plus-receipt — the Era+ receipt, a Phase 2 PLACEHOLDER.
 *
 * The layout and voice are locked now so billing work later only fills in the
 * transaction fields; nothing sends until Era+ exists. The serif headline
 * ("Thank you."), one context line, and a hairline-boxed placeholder block where
 * the plan + payment line items will land — marked with `placeholderNote` in
 * secondary. No button: a receipt is a confirmation, not an action.
 *
 * The props are a deliberate placeholder shape (empty for now) — Phase 2 billing
 * threads the real line items through here without changing the export.
 *
 * Named export for the barrel; default for preview.
 */
import { Section, Text } from '@react-email/components';
import type { CSSProperties } from 'react';

import { BaseEmail } from '../BaseEmail.tsx';
import { emailColors, emailFonts, emailType } from '../tokens.ts';
import { strings } from '@era/core/strings';

const copy = strings.emails.eraPlusReceipt;

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

// The hairline-boxed slot where Phase-2 line items will render.
const placeholderBoxStyle: CSSProperties = {
  border: `1px solid ${emailColors.hairline}`,
  borderRadius: 10,
  padding: '24px',
};

const placeholderNoteStyle: CSSProperties = {
  fontFamily: emailFonts.body,
  fontSize: emailType.caption.sizePx,
  lineHeight: emailType.caption.leading,
  color: emailColors.secondary,
  margin: 0,
  textAlign: 'center',
};

/**
 * Placeholder props — Phase 2 billing lands real line-item fields here without
 * changing the named/default export or the barrel. Empty by design for now.
 */
export type EraPlusReceiptEmailProps = Record<string, never>;

export function EraPlusReceiptEmail(): React.JSX.Element {
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

      <Section style={placeholderBoxStyle}>
        <Text className="email-secondary" style={placeholderNoteStyle}>
          {copy.placeholderNote}
        </Text>
      </Section>
    </BaseEmail>
  );
}

/** No transaction fields yet — the preview shows the locked placeholder shell. */
EraPlusReceiptEmail.PreviewProps = {} satisfies EraPlusReceiptEmailProps;

export default EraPlusReceiptEmail;
