import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  palette,
  baseUnit,
  spacing,
  radii,
  typeRamp,
  elevationDark,
  boxShadowsDark,
  fontFamilies,
  typeRoles,
  serifGuard,
  isSerifVariant,
  roleSizePx,
  mobileSansFamily,
  assertVariantAllowed,
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
  compositeOver,
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

test('radii match the spec (full = orb/pill saturation)', () => {
  assert.deepEqual(radii, { chip: 8, input: 12, card: 16, sheet: 20, hero: 24, full: 9999 });
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

test('type roles: every role is well-formed and maps to a real ramp step', () => {
  const variants = ['display', 'largeTitle', 'title', 'oviAccent', 'body', 'ui', 'caption'] as const;
  assert.deepEqual(Object.keys(typeRoles).sort(), [...variants].sort());
  for (const v of variants) {
    const role = typeRoles[v];
    assert.ok(role.family === 'serif' || role.family === 'sans', `${v} family`);
    assert.equal(typeof role.weight, 'number', `${v} weight`);
    assert.ok(role.leading > 0, `${v} leading`);
    // defaultSize must be a real typeRamp step.
    assert.ok(role.defaultSize in typeRamp, `${v} defaultSize is a ramp step`);
  }
});

test('serif roles carry a Fraunces instance; sans roles a Geist instance', () => {
  for (const v of ['display', 'largeTitle', 'title', 'oviAccent'] as const) {
    assert.ok(isSerifVariant(v), `${v} is serif`);
    assert.match(typeRoles[v].mobileFamily, /^Fraunces-/, `${v} mobile instance`);
  }
  for (const v of ['body', 'ui', 'caption'] as const) {
    assert.equal(isSerifVariant(v), false, `${v} is sans`);
    assert.match(typeRoles[v].mobileFamily, /^Geist-/, `${v} mobile instance`);
  }
});

test('Ovi accent is the baked italic SOFT-60 signature; display is web-only at opsz 144', () => {
  assert.equal(typeRoles.oviAccent.italic, true);
  assert.equal(typeRoles.oviAccent.soft, 60);
  assert.equal(typeRoles.oviAccent.mobileFamily, 'Fraunces-OviAccent');
  assert.equal(typeRoles.display.webOnly, true);
  assert.equal(typeRoles.display.opsz, 144);
  assert.equal(typeRoles.display.webClamp, 'clamp(3rem, 8vw, 6.5rem)');
});

test('mobileSansFamily picks the nearest bundled Geist weight', () => {
  assert.equal(mobileSansFamily(400), fontFamilies.mobileSans.regular);
  assert.equal(mobileSansFamily(450), fontFamilies.mobileSans.regular);
  assert.equal(mobileSansFamily(500), fontFamilies.mobileSans.medium);
  assert.equal(mobileSansFamily(600), fontFamilies.mobileSans.semibold);
  assert.equal(mobileSansFamily(700), fontFamilies.mobileSans.semibold);
});

test('roleSizePx resolves default step, ramp-step override, and raw px', () => {
  assert.equal(roleSizePx('body'), typeRamp.body.px); // default step
  assert.equal(roleSizePx('ui', 'footnote'), typeRamp.footnote.px); // step override
  assert.equal(roleSizePx('title', 24), 24); // raw px
});

test('serif guard: refuses serif below 20px and any serif inside a control', () => {
  // A serif title below the 20px floor is rejected.
  assert.equal(assertVariantAllowed('title', { sizePx: 18, inControl: false }).ok, false);
  // At/above the floor it passes.
  assert.equal(assertVariantAllowed('title', { sizePx: 24, inControl: false }).ok, true);
  // Serif inside a control is rejected regardless of size.
  assert.equal(assertVariantAllowed('title', { sizePx: 34, inControl: true }).ok, false);
  assert.equal(assertVariantAllowed('largeTitle', { sizePx: 40, inControl: true }).ok, false);
  // Sans variants are always fine, even tiny and in a control.
  assert.equal(assertVariantAllowed('ui', { sizePx: 13, inControl: true }).ok, true);
  assert.equal(assertVariantAllowed('caption', { sizePx: 12, inControl: false }).ok, true);
  // oviAccent is exempt from the size floor (inline editorial accent) but still barred from controls.
  assert.equal(assertVariantAllowed('oviAccent', { sizePx: 17, inControl: false }).ok, true);
  assert.equal(assertVariantAllowed('oviAccent', { sizePx: 17, inControl: true }).ok, false);
  // The guard names why it failed.
  assert.match(
    assertVariantAllowed('title', { sizePx: 12, inControl: false }).reason ?? '',
    /≥20px/,
  );
});

test('font families: brand faces + CSS var contract', () => {
  assert.equal(fontFamilies.serif, 'Fraunces');
  assert.equal(fontFamilies.sans, 'Geist');
  assert.deepEqual(fontFamilies.cssVar, { serif: '--font-era-serif', sans: '--font-era-sans' });
  assert.deepEqual(fontFamilies.mobileSans, {
    regular: 'Geist-Regular',
    medium: 'Geist-Medium',
    semibold: 'Geist-SemiBold',
  });
  assert.equal(serifGuard.minSerifPx, 20);
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

test('dark elevation: +0.04/+0.06 opacities, e4 true black at 0.45 (§3)', () => {
  assert.equal(elevationDark.e1.opacity, elevation.e1.opacity + 0.04);
  assert.equal(elevationDark.e2.opacity, elevation.e2.opacity + 0.04);
  assert.equal(
    Math.round(elevationDark.e3.ambient.opacity * 100),
    Math.round((elevation.e3.ambient.opacity + 0.06) * 100),
  );
  assert.equal(
    Math.round(elevationDark.e3.key.opacity * 100),
    Math.round((elevation.e3.key.opacity + 0.06) * 100),
  );
  assert.equal(elevationDark.e4.opacity, 0.45);
  assert.equal(boxShadowsDark.e4, '0 16px 48px rgba(0, 0, 0, 0.45)'); // true black, not ink
  assert.ok(boxShadowsDark.e1.includes('rgba(28, 27, 25')); // e1–e3 stay warm ink
  assert.ok(boxShadowsDark.e3.includes('0.16') && boxShadowsDark.e3.includes('0.18'));

  // rnShadow honours the mode: dark e4 casts black; dark e2 gets the +0.04.
  assert.equal(rnShadow('e4', 'dark').shadowColor, '#000000');
  assert.equal(rnShadow('e4', 'light').shadowColor, palette.ink);
  assert.equal(rnShadow('e2', 'dark').shadowOpacity, 0.12);
  // Default stays light — existing callers are unchanged.
  assert.deepEqual(rnShadow('e2'), rnShadow('e2', 'light'));
});

test('glass, glow, sheen (§3 exact numbers)', () => {
  assert.equal(glass.blur, 20);
  assert.equal(glass.saturate, 1.1); // garments glow slightly through glass
  // Tuned from the §3 doc's 0.72/0.62 per user taste (2026-07-18) — more
  // translucent chrome glass; AA still guaranteed (asserted below).
  assert.deepEqual(glass.tintOpacity, { light: 0.6, dark: 0.55 });
  assert.deepEqual(glass.busyTintOpacity, { light: 0.72, dark: 0.88 });
  assert.equal(glass.borderWidth, 1);
  assert.deepEqual(glass.border, {
    light: 'rgba(28, 27, 25, 0.08)',
    dark: 'rgba(245, 241, 232, 0.08)',
  });
  assert.deepEqual(glass.innerHighlight, {
    color: '#FFFFFF',
    opacity: { light: 0.55, dark: 0.06 },
    height: 1,
  });
  assert.deepEqual(glass.innerHighlightColor, {
    light: 'rgba(255, 255, 255, 0.55)',
    dark: 'rgba(255, 255, 255, 0.06)',
  });

  assert.equal(glow.blurRadius, 24);
  assert.deepEqual(glow.opacity, { light: 0.28, dark: 0.4 });
  assert.deepEqual(glow.pulse, { amount: 0.1, durationMs: 3000 });

  assert.equal(sheen.angleDeg, 135);
  assert.equal(sheen.stopPercent, 60);
  assert.deepEqual(sheen.from, {
    light: 'rgba(255, 255, 255, 0.05)',
    dark: 'rgba(255, 255, 255, 0.04)',
  });
  assert.equal(sheen.to, 'rgba(255, 255, 255, 0)');
  assert.equal(
    sheen.gradient.light,
    'linear-gradient(135deg, rgba(255, 255, 255, 0.05), rgba(255, 255, 255, 0) 60%)',
  );
  assert.equal(
    sheen.gradient.dark,
    'linear-gradient(135deg, rgba(255, 255, 255, 0.04), rgba(255, 255, 255, 0) 60%)',
  );
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

test('motion choreography: press, stagger, pageRise (§3 exact)', () => {
  // "scale 0.97 on press-in ... every tappable element — nothing is inert"
  assert.deepEqual(motion.press, { scale: 0.97 });
  // "stagger children delay 45ms; y 12→0; opacity 0→1; blur 4→0"
  assert.deepEqual(motion.stagger, { delayMs: 45, riseYPx: 12, blurPx: 4 });
  // page/tab content cross-fade rises 6px on the gentle spring
  assert.deepEqual(motion.pageRise, { yPx: 6 });
  // The stagger delay must never let a long list exceed the 350ms feel-budget
  // for its FIRST page of items (~8 visible): 8 * 45 = 360 ≈ the ceiling.
  assert.ok(motion.stagger.delayMs * 8 <= motion.durations.maxMs + motion.stagger.delayMs);
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

test('compositeOver: source-over sRGB mix, exact at the extremes', () => {
  assert.equal(compositeOver('#FFFFFF', '#000000', 1), '#FFFFFF'); // fully opaque top
  assert.equal(compositeOver('#FFFFFF', '#000000', 0), '#000000'); // fully transparent top
  assert.equal(compositeOver('#FFFFFF', '#000000', 0.5), '#808080'); // even mix (rounds up)
});

test('glass AA guarantee: busy tint passes worst-case; default dark honestly fails it', () => {
  const { light, dark } = palette;
  // The busy-worst pairs (declared in contrastPairs) — passing here means text
  // on busy glass clears AA over ANY backdrop.
  const lightBusyWorst = contrastRatio(
    light.text,
    compositeOver(light.surface, '#000000', glass.busyTintOpacity.light),
  );
  const darkBusyWorst = contrastRatio(
    dark.text,
    compositeOver(dark.surface, '#FFFFFF', glass.busyTintOpacity.dark),
  );
  assert.ok(lightBusyWorst >= 4.5, `light busy worst-case ${lightBusyWorst} >= 4.5`);
  assert.ok(darkBusyWorst >= 4.5, `dark busy worst-case ${darkBusyWorst} >= 4.5`);

  // The honest negative — WHY busyTintOpacity exists: the default dark tint
  // (0.62) over a worst-case white backdrop does NOT clear AA. If this ever
  // starts passing (palette change), busy may be reducible — revisit.
  const darkDefaultOverWhite = contrastRatio(
    dark.text,
    compositeOver(dark.surface, '#FFFFFF', glass.tintOpacity.dark),
  );
  assert.ok(darkDefaultOverWhite < 4.5, `dark default over white ${darkDefaultOverWhite} < 4.5 (the busy scrim's reason to exist)`);

  // Light glass needs no busy bump: the DEFAULT light tint already clears AA
  // over a worst-case black backdrop.
  const lightDefaultOverBlack = contrastRatio(
    light.text,
    compositeOver(light.surface, '#000000', glass.tintOpacity.light),
  );
  assert.ok(lightDefaultOverBlack >= 4.5, `light default over black ${lightDefaultOverBlack} >= 4.5`);
});
