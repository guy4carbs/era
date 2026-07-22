/**
 * The derivation guard for `@era/email`. Email clients strip CSS variables, so
 * `tokens.ts` resolves the palette to literal hex — this test is what keeps that
 * resolution honest: every email color must EQUAL its `@era/tokens` source, so a
 * hand-typed hex (the thing the guard exists to catch) fails here. It stands in
 * for the design/font guards that scan only `apps/*` (see CLAUDE.md § Email).
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { palette, spacing, typeRamp } from '@era/tokens';

import { emailColors, emailColorsDark, emailType, emailLayout } from './tokens.ts';

test('light email colors are derived 1:1 from @era/tokens', () => {
  assert.equal(emailColors.canvas, palette.light.bg);
  assert.equal(emailColors.text, palette.light.text);
  assert.equal(emailColors.hairline, palette.light.hairline);
  assert.equal(emailColors.caution, palette.semantic.rust);
  assert.equal(emailColors.secondary, palette.light.secondaryStrong);
});

test('dark email colors are derived 1:1 from @era/tokens', () => {
  assert.equal(emailColorsDark.canvas, palette.dark.bg);
  assert.equal(emailColorsDark.text, palette.dark.text);
  assert.equal(emailColorsDark.hairline, palette.dark.hairline);
  assert.equal(emailColorsDark.secondary, palette.dark.secondaryStrong);
});

test('email type sizes reference the typeRamp steps', () => {
  assert.equal(emailType.h1.sizePx, typeRamp.largeTitle.px);
  assert.equal(emailType.h1.sizePx, 34);
  assert.equal(emailType.h2.sizePx, typeRamp.title2.px);
  assert.equal(emailType.h2.sizePx, 22);
  assert.equal(emailType.body.sizePx, typeRamp.body.px);
  assert.equal(emailType.body.sizePx, 17);
  assert.equal(emailType.caption.sizePx, typeRamp.caption.px);
  assert.equal(emailType.caption.sizePx, 12);
});

test('email container padding is spacing.s12 (48)', () => {
  assert.equal(emailLayout.padPx, spacing.s12);
  assert.equal(emailLayout.padPx, 48);
});
