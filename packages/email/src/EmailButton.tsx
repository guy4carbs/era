/**
 * EmailButton — the one bulletproof CTA button every Era template uses.
 *
 * Outlook (the Word rendering engine) ignores padding and border-radius on an
 * `<a>`, so a plain padded anchor collapses to a text link there. The fix is the
 * classic VML `mso` conditional pattern: a `<v:roundrect>` that ONLY Outlook sees
 * (inside an `<!--[if mso]>` comment) draws the pill natively, while every other
 * client sees the padded `<a>` (inside the `<!--[if !mso]><!-->` inverse comment).
 *
 * React can't emit conditional comments through JSX — the `<!--[if mso]>` markup
 * is a comment, and JSX strips comments — so the whole button is authored as one
 * raw-HTML string and injected via `dangerouslySetInnerHTML`. The href and label
 * come from our own strings/URLs, but both are HTML-escaped anyway (defense in
 * depth: a label with an `&` or a url with a `"` must never break the markup or
 * the VML attribute).
 *
 * Colors come from `emailColors`: `ink` (the reading-text near-black) is the
 * button fill, `cream` (the canvas) is the label color — the inverse lockup, so
 * the CTA reads as a solid ink pill with cream text on the cream page.
 */
import { Section } from '@react-email/components';

import { emailColors, emailFonts } from './tokens.ts';

export interface EmailButtonProps {
  /** The button label — the one action, in plain words. */
  readonly label: string;
  /** Where the button goes — an absolute Era URL. */
  readonly href: string;
}

/** The VML pill's fixed geometry — matched to the anchor's padded box below. */
const VML_WIDTH_PX = 220;
const VML_HEIGHT_PX = 44;
/** roundrect arcsize is a percentage of the shorter side ≈ the 10px radius. */
const VML_ARCSIZE = '23%';

/**
 * HTML-escape a value bound for text content or a double-quoted attribute. Covers
 * the five markup-significant characters so neither the label nor the href can
 * break out of the string we build.
 */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * The anchor style, shared verbatim between the VML `<center>` label and the
 * non-mso `<a>` so the two renderings match: ink fill, cream label, the app's
 * 13px/28px control padding, a 10px radius, the system-sans stack, weight 600, no
 * underline.
 */
const anchorHtml = (href: string, label: string): string =>
  `<a href="${href}" style="display:inline-block;background:${emailColors.text};color:${emailColors.canvas};` +
  `font-family:${emailFonts.body};font-size:15px;font-weight:600;line-height:1;text-decoration:none;` +
  `padding:13px 28px;border-radius:10px;">${label}</a>`;

/**
 * Build the raw button HTML: the mso VML roundrect, then the non-mso padded
 * anchor. The href appears twice (once in the VML `href`, once in the `<a>`) and
 * the label twice (the VML `<center>` and the `<a>` text) — that duplication is
 * the whole point of the dual-render, and the button test asserts it.
 */
function buttonHtml(href: string, label: string): string {
  const safeHref = escapeHtml(href);
  const safeLabel = escapeHtml(label);
  return (
    `<!--[if mso]>` +
    `<v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" href="${safeHref}" ` +
    `style="height:${VML_HEIGHT_PX}px;v-text-anchor:middle;width:${VML_WIDTH_PX}px" ` +
    `arcsize="${VML_ARCSIZE}" fillcolor="${emailColors.text}" stroke="f">` +
    `<center style="color:${emailColors.canvas};font-family:sans-serif;font-size:15px;font-weight:600">${safeLabel}</center>` +
    `</v:roundrect>` +
    `<![endif]-->` +
    `<!--[if !mso]><!-->` +
    anchorHtml(safeHref, safeLabel) +
    `<!--<![endif]-->`
  );
}

/**
 * The centered CTA button, in its own Section. Everything visual is inside the
 * injected raw HTML (conditional comments can't survive JSX); the wrapper `<div>`
 * only centers it.
 */
export function EmailButton({ label, href }: EmailButtonProps): React.JSX.Element {
  return (
    <Section style={{ textAlign: 'center', margin: '4px 0 8px 0' }}>
      <div
        style={{ textAlign: 'center' }}
        dangerouslySetInnerHTML={{ __html: buttonHtml(href, label) }}
      />
    </Section>
  );
}
