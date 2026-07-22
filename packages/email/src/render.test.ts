/**
 * renderEmail's contract test — renders the base-sample template and asserts the
 * load-bearing pieces survive the render: the hosted wordmark, the preview text,
 * the compliant footer address, the dark-mode metas + media query, and a plain-
 * text alternative that carries the address but no markup.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createElement } from 'react';

import { strings } from '@era/core/strings';

import { renderEmail } from './render.ts';
import { emailLayout } from './tokens.ts';
import { BaseSampleEmail } from './templates/base-sample.tsx';

test('base-sample renders HTML with the mark, preview, footer, and dark-mode block', async () => {
  const { html } = await renderEmail(createElement(BaseSampleEmail));

  // The hosted wordmark and its accessible name.
  assert.ok(html.includes(emailLayout.markSrc), 'markSrc img present');
  assert.ok(html.includes('alt="era."'), 'wordmark alt text present');

  // The inbox-preview text.
  assert.ok(html.includes("the week&#x27;s era") || html.includes("the week's era"), 'preview text present');

  // The compliant footer address.
  assert.ok(html.includes(strings.emails.footer.address), 'footer address present');

  // Dark-mode support: the color-scheme meta and the prefers-color-scheme block.
  assert.ok(html.includes('color-scheme'), 'color-scheme meta present');
  assert.ok(html.includes('prefers-color-scheme: dark'), 'dark-mode media query present');
});

test('base-sample renders a non-empty, markup-free plain-text alternative', async () => {
  const { text } = await renderEmail(createElement(BaseSampleEmail));

  assert.ok(text.length > 0, 'text is non-empty');
  assert.ok(text.includes(strings.emails.footer.address), 'text carries the footer address');
  assert.ok(!text.includes('<'), 'text has no markup');
});
