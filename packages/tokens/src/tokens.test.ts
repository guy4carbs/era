import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  palette,
  baseUnit,
  spacing,
  radii,
  typeRamp,
  elevation,
  boxShadows,
  rnShadow,
  glass,
  glow,
  sheen,
  motion,
  layout,
  relativeLuminance,
  contrastRatio,
  contrastPairs,
  runContrastAudit,
} from './index.ts';

test('palette carries the exact spec colors for both modes', () => {
  assert.equal(palette.light.bg, '#FAF7F0');
  assert.equal(palette.light.surface, '#F5F1E8');
  assert.equal(palette.light.text, '#1C1B19');
  assert.equal(palette.light.secondary, '#8A857C');
  assert.equal(palette.light.secondaryStrong, '#6E695F');
  assert.equal(palette.light.accent, '#A89B86');
  assert.equal(palette.light.hairline, '#E2DACB');

  assert.equal(palette.dark.bg, '#1C1B19');
  assert.equal(palette.dark.surface, '#26241F');
  assert.equal(palette.dark.text, '#F5F1E8');
  assert.equal(palette.dark.secondary, '#A89B86');
  assert.equal(palette.dark.secondaryStrong, '#B5AC9C');
  assert.equal(palette.dark.accent, '#C9BEA9');
  assert.equal(palette.dark.hairline, '#3A3833');

  assert.equal(palette.semantic.sage, '#5A6650');
  assert.equal(palette.semantic.rust, '#9C5A3C');

  // ink is the warm shadow color, never pure black.
  assert.equal(palette.ink, '#1C1B19');
  assert.notEqual(palette.ink, '#000000');
  assert.equal(palette.white, '#FFFFFF');
});

test('spacing is a 4pt scale', () => {
  assert.equal(baseUnit, 4);
  assert.deepEqual(spacing, {
    s1: 4,
    s2: 8,
    s3: 12,
    s4: 16,
    s6: 24,
    s8: 32,
    s12: 48,
    s16: 64,
  });
  // every step is a multiple of the base unit
  for (const value of Object.values(spacing)) {
    assert.equal(value % baseUnit, 0);
  }
});

test('radii match the spec', () => {
  assert.deepEqual(radii, { chip: 8, input: 12, card: 16, sheet: 20, hero: 24 });
});

test('type ramp: sizes, rem = px/16, lineHeight = round(px * 1.3)', () => {
  assert.equal(typeRamp.body.pt, 17); // HIG anchor
  assert.equal(typeRamp.body.px, 17);
  assert.equal(typeRamp.display.pt, null); // web-only hero
  assert.equal(typeRamp.display.px, 55);

  const expected = {
    caption: 12,
    footnote: 13,
    subhead: 15,
    body: 17,
    title3: 20,
    title2: 22,
    title1: 28,
    largeTitle: 34,
    display: 55,
  } as const;

  for (const [name, px] of Object.entries(expected)) {
    const entry = typeRamp[name as keyof typeof typeRamp];
    assert.equal(entry.px, px, `${name} px`);
    assert.equal(entry.rem, `${px / 16}rem`, `${name} rem`);
    assert.equal(entry.lineHeight, Math.round(px * 1.3), `${name} lineHeight`);
  }
});

test('elevation numbers and prebuilt CSS shadows', () => {
  assert.deepEqual(elevation.e1, { y: 1, blur: 2, opacity: 0.06 });
  assert.deepEqual(elevation.e2, { y: 2, blur: 8, opacity: 0.08 });
  assert.deepEqual(elevation.e3, {
    ambient: { y: 8, blur: 24, opacity: 0.1 },
    key: { y: 2, blur: 6, opacity: 0.12 },
  });
  assert.deepEqual(elevation.e4, { y: 16, blur: 48, opacity: 0.18 });

  // e3 is a comma-joined dual shadow (ambient then key); the two layers are
  // separated by '), ' (the inner rgba commas are not preceded by a paren).
  assert.equal(boxShadows.e3.split('), ').length, 2);
  assert.equal(
    boxShadows.e3,
    '0 8px 24px rgba(28, 27, 25, 0.1), 0 2px 6px rgba(28, 27, 25, 0.12)',
  );
  // warm ink, never pure black.
  assert.ok(boxShadows.e1.includes('rgba(28, 27, 25'));
});

test('rnShadow returns RN props with warm ink color; e3 uses ambient layer', () => {
  const e2 = rnShadow('e2');
  assert.equal(e2.shadowColor, palette.ink);
  assert.deepEqual(e2.shadowOffset, { width: 0, height: 2 });
  assert.equal(e2.shadowRadius, 8);
  assert.equal(e2.shadowOpacity, 0.08);
  assert.equal(e2.elevation, 4);

  const e3 = rnShadow('e3');
  assert.deepEqual(e3.shadowOffset, { width: 0, height: 8 }); // ambient.y
  assert.equal(e3.shadowRadius, 24); // ambient.blur
  assert.equal(e3.shadowOpacity, 0.1); // ambient.opacity
});

test('glass, glow, sheen', () => {
  assert.equal(glass.blur, 20);
  assert.deepEqual(glass.tintOpacity, { light: 0.7, dark: 0.6 });
  assert.equal(glass.borderWidth, 1);
  assert.deepEqual(glass.innerHighlight, { color: '#FFFFFF', opacity: 0.08, height: 1 });

  assert.equal(glow.blurRadius, 24);
  assert.deepEqual(glow.opacity, { light: 0.28, dark: 0.4 });
  assert.deepEqual(glow.pulse, { amount: 0.1, durationMs: 3000 });

  assert.equal(sheen.angleDeg, 135);
  assert.equal(sheen.from, 'rgba(255, 255, 255, 0.05)');
  assert.equal(sheen.to, 'rgba(255, 255, 255, 0)');
});

test('motion springs, easing, durations, tilt', () => {
  assert.deepEqual(motion.springs.gentle, { stiffness: 170, damping: 26 });
  assert.deepEqual(motion.springs.snappy, { stiffness: 300, damping: 30 });
  assert.deepEqual(motion.springs.fluid, { stiffness: 220, damping: 28 });
  assert.equal(motion.easing.css, 'cubic-bezier(0.32, 0.72, 0, 1)');
  assert.deepEqual(motion.easing.bezier, [0.32, 0.72, 0, 1]);
  assert.deepEqual(motion.durations, { minMs: 200, maxMs: 350, reducedFadeMs: 150 });
  assert.deepEqual(motion.tilt, { maxDeg: 7, parallaxPx: 6 });
});

test('layout: touch targets, grid, phi split, sheet peek, breakpoints', () => {
  assert.deepEqual(layout.touchTarget, { ios: 44, webMin: 44, webPreferred: 48 });
  assert.equal(layout.tabBarHeight, 49);
  assert.equal(layout.headerHeight, 44);
  assert.deepEqual(layout.itemCard, { aspectRatio: '4 / 5', ratio: 0.8, padding: 12 });
  assert.deepEqual(layout.grid, {
    mobileColumns: 2,
    mobileMargin: 16,
    gutter: 12,
    desktopColumnsMin: 4,
    desktopColumnsMax: 6,
  });
  assert.equal(layout.contentMaxWidth, 1200);
  assert.equal(layout.phi, 1.618);
  assert.deepEqual(layout.heroSplit, { primary: 61.8, secondary: 38.2 });
  assert.equal(layout.sheetPeekFraction, 0.382);
  assert.equal(layout.feedColumnWidth, 480);
  assert.deepEqual(layout.breakpoints, { sm: 640, md: 768, lg: 1024, xl: 1280 });
  assert.deepEqual(layout.hover, { liftPx: -2, glowIntensity: 0.6 });
});

test('WCAG math: known references', () => {
  // black on white is the canonical 21:1.
  assert.equal(Math.round(contrastRatio('#000000', '#FFFFFF')), 21);
  // luminance of pure white is 1, pure black is 0.
  assert.equal(relativeLuminance('#FFFFFF'), 1);
  assert.equal(relativeLuminance('#000000'), 0);
  // ratio is symmetric.
  assert.equal(
    contrastRatio(palette.light.text, palette.light.bg),
    contrastRatio(palette.light.bg, palette.light.text),
  );
});

test('contrast gate: every declared pair passes at its declared usage', () => {
  const rows = runContrastAudit();
  assert.equal(rows.length, contrastPairs.length);
  const failures = rows.filter((row) => !row.pass);
  assert.deepEqual(
    failures,
    [],
    `failing pairs: ${failures.map((f) => `${f.id} ${f.ratio}<${f.required}`).join(', ')}`,
  );
  // usage tiers require the right minimum.
  for (const row of rows) {
    const min = row.usage === 'body' ? 4.5 : 3;
    assert.equal(row.required, min, `${row.id} required for usage ${row.usage}`);
    assert.ok(row.ratio >= row.required, `${row.id} ratio ${row.ratio} >= ${row.required}`);
  }
});

test('secondary #8A857C on bg #FAF7F0 is large-only (between 3 and 4.5)', () => {
  const ratio = contrastRatio('#8A857C', '#FAF7F0');
  assert.ok(ratio > 3, `expected > 3, got ${ratio}`);
  assert.ok(ratio < 4.5, `expected < 4.5, got ${ratio}`);
});
