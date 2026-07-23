/**
 * EmailButton's contract test — the bulletproof-button invariant.
 *
 * Renders the button through `renderEmail` and asserts the dual-render survives:
 * the mso conditional comment, the VML `<v:roundrect>` Outlook draws, and BOTH
 * the href and the label appearing twice (once in the VML, once in the padded
 * `<a>`). If a future edit drops the VML half, Outlook silently loses the pill —
 * this test is what catches that.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createElement } from 'react';

import { renderEmail } from './render.ts';
import { EmailButton } from './EmailButton.tsx';

const LABEL = 'Sign in to Era';
const HREF = 'https://era.style/sign-in/confirm?next=%2F';

test('renders the mso VML conditional and the non-mso anchor, href + label twice each', async () => {
  const { html } = await renderEmail(createElement(EmailButton, { label: LABEL, href: HREF }));

  // The Outlook-only conditional comment and its VML pill.
  assert.ok(html.includes('<!--[if mso]>'), 'mso conditional comment present');
  assert.ok(html.includes('v:roundrect'), 'VML roundrect present');

  // The href appears twice — the VML href and the anchor href.
  const hrefMatches = html.split(HREF).length - 1;
  assert.equal(hrefMatches, 2, 'href appears twice (VML + anchor)');

  // The label appears twice — the VML <center> and the anchor text.
  const labelMatches = html.split(LABEL).length - 1;
  assert.equal(labelMatches, 2, 'label appears twice (VML + anchor)');
});
